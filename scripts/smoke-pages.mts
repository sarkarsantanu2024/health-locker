import { createHash, randomUUID } from "node:crypto";

import { PrismaClient, type Role } from "@prisma/client";
import { config } from "dotenv";
import { SignJWT } from "jose";

import { NAV_BY_ROLE } from "@/modules/identity/navigation";

/**
 * Renders every authenticated page against a running dev/prod server, using a
 * real session cookie, and fails if any page errors while rendering.
 *
 *   pnpm dev            # in another terminal
 *   pnpm smoke
 *
 * Why this exists: a route test that only checks "signed out → 307 /login"
 * proves nothing about whether the page renders once you ARE signed in. That
 * gap let a server→client serialisation bug reach the browser — the page still
 * returned 200 while every nav item logged a React error.
 *
 * Creates throwaway users, then deletes them.
 */

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

const BASE = process.env.SMOKE_BASE ?? "http://localhost:3000";
const prisma = new PrismaClient();

if (!process.env.AUTH_JWT_SECRET) throw new Error("AUTH_JWT_SECRET is required.");
const secret = new TextEncoder().encode(process.env.AUTH_JWT_SECRET);

async function mintSession(user: { id: string; role: Role; orgId: string | null }): Promise<string> {
  const sid = randomUUID();
  const claims = { sub: user.id, role: user.role, orgId: user.orgId, mustChangePassword: false, sid };

  const sign = (typ: string, ttl: number) =>
    new SignJWT({ ...claims, typ })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("healthlocker")
      .setAudience("healthlocker.app")
      .setIssuedAt()
      .setExpirationTime(`${ttl}s`)
      .sign(secret);

  const [access, refresh] = await Promise.all([sign("access", 900), sign("refresh", 3600)]);

  await prisma.session.create({
    data: {
      id: sid,
      userId: user.id,
      refreshTokenHash: createHash("sha256").update(refresh).digest("hex"),
      expiresAt: new Date(Date.now() + 3_600_000),
    },
  });

  return `${process.env.AUTH_COOKIE_PREFIX ?? "hl"}_at=${access}`;
}

/**
 * Every role whose portal we walk. Paths come from NAV_BY_ROLE rather than a
 * hand-written list, so a link added to the sidebar is automatically covered —
 * a hand-picked list is what let a set of 404ing nav links reach the browser.
 */
const ROLES_UNDER_TEST: Role[] = [
  "SUPER_ADMIN",
  "CLINIC_ADMIN",
  "HOSPITAL_ADMIN",
  "DIAGNOSTIC_ADMIN",
  "PHARMACY_ADMIN",
  "PATIENT",
];

/** Demo tenants from prisma/seed.ts. */
const ORG_BY_ROLE: Partial<Record<Role, string>> = {
  CLINIC_ADMIN: "org-demo-clinic",
  HOSPITAL_ADMIN: "org-demo-hospital",
  DIAGNOSTIC_ADMIN: "org-demo-diagnostic",
  PHARMACY_ADMIN: "org-demo-pharmacy",
};

/**
 * Reachable pages that are NOT in the sidebar — settings, sub-forms and detail
 * screens. The nav walk cannot find these, and they are exactly where a
 * serialisation bug hides longest because nobody clicks them during a demo.
 */
const EXTRA_PATHS: Partial<Record<Role, string[]>> = {
  SUPER_ADMIN: ["/notifications/settings", "/account/privacy"],
  PATIENT: ["/notifications/settings", "/account/privacy"],
  CLINIC_ADMIN: ["/clinic/patients/new", "/clinic/encounters/new", "/clinic/billing/new"],
  HOSPITAL_ADMIN: ["/hospital/patients/new", "/hospital/billing/new"],
  DIAGNOSTIC_ADMIN: ["/diagnostic/patients/new", "/diagnostic/reports/new"],
  PHARMACY_ADMIN: ["/pharmacy/patients/new", "/pharmacy/billing/new"],
};

/** Next embeds these into the HTML when a render throws or logs an error. */
const RENDER_ERROR =
  /Only plain objects can be passed|__next_error__|Unhandled Runtime Error|Server Error|Application error/i;

/**
 * Routes that MUST render with no session at all. A redirect to /login here is a
 * bug, not a safeguard: /pay deadlocks onboarding (the payer has no account yet)
 * and /emergency has to work when the patient cannot speak.
 */
async function checkPublicRoutes(): Promise<number> {
  const liveRequest = await prisma.paymentRequest.findFirst({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: { refCode: true },
  });

  const routes = [
    // The marketing site. `/` must render the pitch for an anonymous visitor
    // rather than bouncing to /login, which is what it did before the public
    // site existed.
    { path: "/", mustContain: "in one place" },
    { path: "/pricing", mustContain: "pricing" },
    { path: "/login", mustContain: "Sign in" },
    { path: "/signup", mustContain: "Create your" },
    ...(liveRequest ? [{ path: `/pay/${liveRequest.refCode}`, mustContain: "Reference" }] : []),
    // A bogus token must still render the public page, not a login redirect.
    { path: `/emergency/${"0".repeat(32)}`, mustContain: "not available" },
  ];

  let failures = 0;

  for (const route of routes) {
    const response = await fetch(`${BASE}${route.path}`, { redirect: "manual" });
    const body = response.status === 200 ? await response.text() : "";
    // A 3xx means middleware bounced it to /login.
    const ok = response.status === 200 && body.includes(route.mustContain);

    if (!ok) failures += 1;
    process.stdout.write(
      `${ok ? "PASS" : "FAIL"}  ${"(public)".padEnd(18)} ${route.path.padEnd(42)} ${response.status}` +
        (response.status >= 300 && response.status < 400 ? "   <- redirected, should be public" : "") +
        "\n",
    );
  }

  return failures;
}

/**
 * Deletes throwaway accounts left behind by a previous run.
 *
 * Cleanup normally happens in the `finally` below, but that does not run if the
 * process is killed — and these are ACTIVE accounts, one of them a SUPER_ADMIN.
 * A stray super-admin row surviving a Ctrl-C is not acceptable, so each run
 * sweeps before it starts rather than trusting the last one to have tidied up.
 */
async function sweepPreviousRuns(): Promise<void> {
  const stale = await prisma.user.findMany({
    where: { username: { startsWith: "smoke." } },
    select: { id: true },
  });

  if (stale.length === 0) return;

  const ids = stale.map((user) => user.id);

  await prisma.session.deleteMany({ where: { userId: { in: ids } } });
  await prisma.patient.deleteMany({ where: { userId: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });

  process.stdout.write(`Removed ${ids.length} account(s) left by an interrupted run.\n`);
}

async function main(): Promise<void> {
  const createdIds: string[] = [];

  await sweepPreviousRuns();

  let failures = await checkPublicRoutes();

  try {
    for (const role of ROLES_UNDER_TEST) {
      const paths = [...NAV_BY_ROLE[role].map((item) => item.href), ...(EXTRA_PATHS[role] ?? [])];

      const user = await prisma.user.create({
        data: {
          username: `smoke.${role.toLowerCase()}.${Date.now()}`,
          passwordHash: "unused-smoke-account",
          displayName: `Smoke ${role}`,
          role,
          orgId: ORG_BY_ROLE[role] ?? null,
          status: "ACTIVE",
          mustChangePassword: false,
        },
      });
      createdIds.push(user.id);

      if (role === "PATIENT") {
        await prisma.patient.create({ data: { userId: user.id, fullName: "Smoke Patient" } });
      }

      const cookie = await mintSession(user);

      for (const path of paths) {
        const response = await fetch(`${BASE}${path}`, { headers: { cookie }, redirect: "manual" });
        const body = await response.text();
        const hasRenderError = RENDER_ERROR.test(body);
        const ok = response.status === 200 && !hasRenderError;

        if (!ok) failures += 1;

        process.stdout.write(
          `${ok ? "PASS" : "FAIL"}  ${role.padEnd(18)} ${path.padEnd(32)} ${response.status}` +
            (hasRenderError ? "   <- render error in HTML" : "") +
            "\n",
        );
      }
    }
  } finally {
    await prisma.session.deleteMany({ where: { userId: { in: createdIds } } });
    await prisma.patient.deleteMany({ where: { userId: { in: createdIds } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: createdIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdIds } } });
    await prisma.$disconnect();
  }

  if (failures > 0) {
    process.stderr.write(`\n${failures} page(s) failed to render.\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write("\nAll authenticated pages rendered cleanly.\n");
}

main().catch((error: unknown) => {
  process.stderr.write(`\nsmoke-pages failed: ${(error as Error).message}\n`);
  process.exitCode = 1;
});
