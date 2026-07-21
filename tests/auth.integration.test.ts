import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * End-to-end authentication and authorization against a REAL database.
 *
 * Two mocks make server-only primitives runnable outside a request:
 *   - next/headers → an in-memory cookie jar, so session cookies round-trip.
 *   - react.cache  → identity, since per-request memoisation needs a render.
 * Everything below them (Prisma, argon2, jose, the guards) is the real thing.
 */

const cookieJar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieJar.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (name: string, value: string) => {
      // maxAge 0 is a deletion, exactly as a browser would treat it.
      if (value === "") cookieJar.delete(name);
      else cookieJar.set(name, value);
    },
  }),
  headers: async () => new Headers({ "user-agent": "vitest" }),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: <T,>(fn: T) => fn };
});

const { getSession, requirePermission, requireTenant, requireUser, assertSameTenant } = await import(
  "@/lib/auth/session"
);
const { changeOwnPassword, login, logout } = await import("@/modules/identity/auth.service");
const { createUser, platformScope, resetPassword, setUserActive } = await import(
  "@/modules/identity/provisioning.service"
);
const { registerConsumer } = await import("@/modules/identity/signup.service");
const { resetMemoryLimiter } = await import("@/lib/ratelimit");

const prisma = new PrismaClient();

const SUFFIX = "authspec";
const ORG_A = `org-${SUFFIX}-a`;
const ORG_B = `org-${SUFFIX}-b`;

let adminId: string;
let patient: { userId: string; username: string; temporaryPassword: string };
let staffA: { userId: string; username: string; temporaryPassword: string };
let staffB: { userId: string; username: string; temporaryPassword: string };

/** Signs everyone out between cases so each starts from a clean cookie jar. */
function clearCookies() {
  cookieJar.clear();
}

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { username: { contains: SUFFIX } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);

  await prisma.session.deleteMany({ where: { userId: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ actorId: { in: ids } }, { entityId: { in: ids } }] } });
  await prisma.accessRequest.deleteMany({ where: { provisionedUserId: { in: ids } } });
  await prisma.subscription.deleteMany({ where: { patient: { userId: { in: ids } } } });
  await prisma.patient.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.organization.deleteMany({ where: { id: { in: [ORG_A, ORG_B] } } });
}

beforeAll(async () => {
  await cleanup();

  await prisma.organization.createMany({
    data: [
      { id: ORG_A, slug: `${SUFFIX}-clinic-a`, name: "Spec Clinic A", type: "CLINIC" },
      { id: ORG_B, slug: `${SUFFIX}-clinic-b`, name: "Spec Clinic B", type: "CLINIC" },
    ],
  });

  const admin = await prisma.user.create({
    data: {
      username: `admin.${SUFFIX}`,
      passwordHash: "unused",
      displayName: "Spec Admin",
      role: "SUPER_ADMIN",
      status: "ACTIVE",
      mustChangePassword: false,
    },
    select: { id: true },
  });
  adminId = admin.id;

  patient = await createUser(
    { displayName: `Spec Patient ${SUFFIX}`, role: "PATIENT", username: `patient.${SUFFIX}` },
    platformScope(adminId),
  );
  staffA = await createUser(
    { displayName: `Spec Staff A ${SUFFIX}`, role: "CLINIC_STAFF", orgId: ORG_A, username: `staffa.${SUFFIX}` },
    platformScope(adminId),
  );
  staffB = await createUser(
    { displayName: `Spec Staff B ${SUFFIX}`, role: "CLINIC_STAFF", orgId: ORG_B, username: `staffb.${SUFFIX}` },
    platformScope(adminId),
  );
}, 60_000);

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

beforeEach(() => {
  clearCookies();
  // Login and signup are IP-throttled; without this the suite throttles itself.
  resetMemoryLimiter();
});

describe("acceptance: only activated accounts can sign in", () => {
  it("refuses a self-registered account until an admin activates it", async () => {
    const signup = await registerConsumer(
      {
        username: `selfreg.${SUFFIX}`,
        password: "a-self-chosen-passphrase",
        confirmPassword: "a-self-chosen-passphrase",
        fullName: "Self Registered",
        phone: "9800000199",
        addressLine: "1 Test Road",
        city: "Kolkata",
        state: "West Bengal",
        pincode: "700001",
        planId: "plan-patient-free",
        consent: true,
      },
      "127.0.0.1",
    );

    const created = await prisma.user.findUnique({ where: { id: signup.userId } });
    expect(created?.status).toBe("PENDING_ACTIVATION");
    // They chose the password themselves, so there is nothing to rotate.
    expect(created?.mustChangePassword).toBe(false);

    await expect(
      login({ username: `selfreg.${SUFFIX}`, password: "a-self-chosen-passphrase" }, "127.0.0.1"),
    ).rejects.toThrow(/Incorrect username or password/);

    // The onboarding queue can see them waiting.
    const request = await prisma.accessRequest.findFirst({
      where: { provisionedUserId: signup.userId },
    });
    expect(request?.status).toBe("PENDING");

    await setUserActive(signup.userId, true, platformScope(adminId), "payment verified");

    const result = await login(
      { username: `selfreg.${SUFFIX}`, password: "a-self-chosen-passphrase" },
      "127.0.0.1",
    );
    expect(result.mustChangePassword).toBe(false);

    const provisioned = await prisma.accessRequest.findFirst({
      where: { provisionedUserId: signup.userId },
    });
    expect(provisioned?.status).toBe("PROVISIONED");
  });

  it("rejects a duplicate username", async () => {
    await expect(
      registerConsumer(
        {
          username: `patient.${SUFFIX}`,
          password: "another-long-passphrase",
          confirmPassword: "another-long-passphrase",
          fullName: "Impostor",
          phone: "9800000198",
          addressLine: "2 Test Road",
          city: "Kolkata",
          state: "West Bengal",
          pincode: "700001",
          planId: "plan-patient-free",
          consent: true,
        },
        "127.0.0.2",
      ),
    ).rejects.toThrow(/taken/);
  });

  it("refuses a suspended account", async () => {
    await setUserActive(staffB.userId, false, platformScope(adminId), "spec");

    await expect(
      login({ username: staffB.username, password: staffB.temporaryPassword }, "127.0.0.1"),
    ).rejects.toThrow(/Incorrect username or password/);

    await setUserActive(staffB.userId, true, platformScope(adminId), "spec restore");
  });

  it("refuses an unknown username with the same message as a wrong password", async () => {
    // Awaited one at a time. Starting both up front leaves the second promise
    // rejected-but-unobserved for a tick, which Vitest reports as an unhandled
    // rejection and attributes to whichever test happens to be running.
    await expect(
      login({ username: "nobody.here", password: "whatever" }, "127.0.0.1"),
    ).rejects.toThrow(/Incorrect username or password/);

    await expect(
      login({ username: patient.username, password: "wrong-password" }, "127.0.0.1"),
    ).rejects.toThrow(/Incorrect username or password/);
  });
});

describe("acceptance: first login forces a password change", () => {
  it("blocks everything except the password change until it is done", async () => {
    const result = await login(
      { username: patient.username, password: patient.temporaryPassword },
      "127.0.0.1",
    );

    expect(result.mustChangePassword).toBe(true);

    const session = await getSession();
    expect(session?.mustChangePassword).toBe(true);

    // requireUser is what every other action goes through.
    await expect(requireUser()).rejects.toThrow(/must change your password/i);

    await changeOwnPassword(
      patient.userId,
      patient.temporaryPassword,
      "my-own-chosen-passphrase",
      "127.0.0.1",
    );

    const updated = await prisma.user.findUnique({ where: { id: patient.userId } });
    expect(updated?.mustChangePassword).toBe(false);
    expect(updated?.passwordChangedAt).not.toBeNull();

    // The old password no longer works; the new one does.
    clearCookies();
    resetMemoryLimiter();
    await expect(
      login({ username: patient.username, password: patient.temporaryPassword }, "127.0.0.1"),
    ).rejects.toThrow();

    resetMemoryLimiter();
    const after = await login(
      { username: patient.username, password: "my-own-chosen-passphrase" },
      "127.0.0.1",
    );
    expect(after.mustChangePassword).toBe(false);
    await expect(requireUser()).resolves.toMatchObject({ username: patient.username });

    patient.temporaryPassword = "my-own-chosen-passphrase";
  });

  it("signs out every other device on a password change", async () => {
    await login({ username: staffA.username, password: staffA.temporaryPassword }, "127.0.0.1");
    const first = await getSession();
    expect(first).not.toBeNull();

    await changeOwnPassword(
      staffA.userId,
      staffA.temporaryPassword,
      "staff-a-new-passphrase",
      "127.0.0.1",
    );
    staffA.temporaryPassword = "staff-a-new-passphrase";

    // Same cookie, but the session row behind it is revoked.
    expect(await getSession()).toBeNull();
  });
});

describe("lockout", () => {
  it("locks the account after repeated wrong passwords, then refuses even the right one", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      resetMemoryLimiter();
      await expect(
        login({ username: staffB.username, password: `wrong-${attempt}` }, "10.0.0.1"),
      ).rejects.toThrow();
    }

    const locked = await prisma.user.findUnique({ where: { id: staffB.userId } });
    expect(locked?.failedLoginCount).toBeGreaterThanOrEqual(5);
    expect(locked?.lockedUntil).not.toBeNull();

    resetMemoryLimiter();
    await expect(
      login({ username: staffB.username, password: staffB.temporaryPassword }, "10.0.0.1"),
    ).rejects.toThrow(/temporarily locked/i);

    // An admin reset clears the lock.
    const reissued = await resetPassword(staffB.userId, platformScope(adminId), "spec unlock");
    staffB.temporaryPassword = reissued.temporaryPassword;

    resetMemoryLimiter();
    await expect(
      login({ username: staffB.username, password: staffB.temporaryPassword }, "10.0.0.1"),
    ).resolves.toMatchObject({ mustChangePassword: true });
  });

  it("throttles by IP before the account is even touched", async () => {
    resetMemoryLimiter();

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await expect(login({ username: "nobody.here", password: "x" }, "10.9.9.9")).rejects.toThrow();
    }

    await expect(login({ username: "nobody.here", password: "x" }, "10.9.9.9")).rejects.toThrow(
      /too many attempts/i,
    );
  });
});

describe("acceptance: tenant isolation", () => {
  it("scopes a provider to their own organization", async () => {
    await login({ username: staffA.username, password: staffA.temporaryPassword }, "127.0.0.1");
    // staffA still has mustChangePassword from the admin reset path? No — this
    // account changed its password above, so requireTenant is reachable.
    const { orgId } = await requireTenant();

    expect(orgId).toBe(ORG_A);
    // A row from the other tenant is reported as missing, not forbidden.
    expect(() => assertSameTenant(ORG_B, orgId)).toThrow(/not found/i);
    expect(() => assertSameTenant(ORG_A, orgId)).not.toThrow();
  });

  it("refuses tenant scope to a patient, who has no organization", async () => {
    await login({ username: patient.username, password: patient.temporaryPassword }, "127.0.0.1");

    await expect(requireTenant()).rejects.toThrow(/requires a provider account/i);
  });
});

describe("acceptance: a patient cannot reach admin actions", () => {
  it("denies admin permissions to a patient session", async () => {
    await login({ username: patient.username, password: patient.temporaryPassword }, "127.0.0.1");

    for (const permission of ["user:create", "payment:verify", "audit:read", "org:manage"] as const) {
      await expect(requirePermission(permission)).rejects.toThrow(/do not have permission/i);
    }
  });

  it("allows a patient their own permissions", async () => {
    await login({ username: patient.username, password: patient.temporaryPassword }, "127.0.0.1");

    await expect(requirePermission("document:upload")).resolves.toMatchObject({
      role: "PATIENT",
    });
  });

  it("denies staff-level users the admin actions their org admin has", async () => {
    await login({ username: staffA.username, password: staffA.temporaryPassword }, "127.0.0.1");

    await expect(requirePermission("user:create")).rejects.toThrow(/do not have permission/i);
    await expect(requirePermission("prescription:create")).resolves.toMatchObject({
      role: "CLINIC_STAFF",
    });
  });
});

describe("sessions", () => {
  it("drops the session on sign-out", async () => {
    await login({ username: patient.username, password: patient.temporaryPassword }, "127.0.0.1");
    const session = await getSession();
    expect(session).not.toBeNull();

    await logout(session!.sessionId);

    expect(await getSession()).toBeNull();
    const row = await prisma.session.findUnique({ where: { id: session!.sessionId } });
    expect(row?.revokedAt).not.toBeNull();
  });

  it("stores only a hash of the refresh token", async () => {
    await login({ username: patient.username, password: patient.temporaryPassword }, "127.0.0.1");
    const session = await getSession();

    const row = await prisma.session.findUnique({ where: { id: session!.sessionId } });
    // A digest, never the token itself: a leaked dump must not be replayable.
    expect(row?.refreshTokenHash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("provisioning", () => {
  it("refuses a provider role without an organization", async () => {
    await expect(
      createUser({ displayName: "No Org", role: "CLINIC_STAFF" }, platformScope(adminId)),
    ).rejects.toThrow(/requires an organization/i);
  });

  it("refuses a patient attached to an organization", async () => {
    await expect(
      createUser({ displayName: "Odd Patient", role: "PATIENT", orgId: ORG_A }, platformScope(adminId)),
    ).rejects.toThrow(/not attached to an organization/i);
  });

  it("refuses a role whose type does not match the organization", async () => {
    await expect(
      createUser({ displayName: "Wrong Type", role: "PHARMACY_STAFF", orgId: ORG_A }, platformScope(adminId)),
    ).rejects.toThrow(/belongs to a PHARMACY/i);
  });

  it("creates a patient profile alongside a PATIENT account", async () => {
    const profile = await prisma.patient.findFirst({ where: { userId: patient.userId } });
    expect(profile?.fullName).toContain("Spec Patient");
  });

  it("audits creation without ever recording the password", async () => {
    const entries = await prisma.auditLog.findMany({
      where: { entityId: patient.userId, action: "user.created" },
    });

    expect(entries).toHaveLength(1);
    const serialised = JSON.stringify(entries[0].metadata);
    expect(serialised).toContain(patient.username);
    expect(serialised).not.toContain(patient.temporaryPassword);
  });

  it("refuses to suspend the last active Super Admin", async () => {
    const others = await prisma.user.count({
      where: { role: "SUPER_ADMIN", status: "ACTIVE", deletedAt: null, id: { not: adminId } },
    });

    if (others === 0) {
      await expect(setUserActive(adminId, false, platformScope(adminId))).rejects.toThrow();
    } else {
      // Another Super Admin exists (the real root.admin), so self-suspension is
      // refused for the separate "cannot suspend yourself" reason.
      await expect(setUserActive(adminId, false, platformScope(adminId))).rejects.toThrow(/your own account/i);
    }
  });
});
