import { beforeEach, describe, expect, it, vi } from "vitest";

import { CONSUMER_ROLES, PLATFORM_ROLES, ROLES, type Role } from "@/shared/enums";

/**
 * Role × guard matrix.
 *
 * The services are tenant-safe because `orgId` only ever comes from a guard.
 * That makes the guards the one place a role mix-up can slip through, so every
 * role is pushed through every guard here, with the database and cookie layers
 * stubbed. The integration suites exercise the services with a real database;
 * this file is the piece that was missing — nothing had asked "which ROLE may
 * reach the platform console?" rather than "which permission string?".
 */

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: <T,>(fn: T) => fn };
});

vi.mock("@/lib/auth/cookies", () => ({
  readAccessToken: vi.fn(async () => "token"),
}));

vi.mock("@/lib/auth/jwt", () => ({
  verifyToken: vi.fn(async () => ({ sub: "user-1", sid: "sess-1" })),
}));

const userFindFirst = vi.fn();
const sessionFindFirst = vi.fn(async () => ({ id: "sess-1" }));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findFirst: () => userFindFirst() },
    session: { findFirst: () => sessionFindFirst() },
  },
}));

const {
  requirePermission,
  requirePlatformPermission,
  requirePlatformUser,
  requireTenant,
  requireTenantPermission,
  requireUser,
} = await import("@/lib/auth/session");

/**
 * Mirrors `validateOrgForRole` in provisioning: platform and consumer accounts
 * are never attached to an organization; every provider role always is.
 */
function signInAs(role: Role, overrides: Partial<{ orgId: string | null; mustChangePassword: boolean }> = {}) {
  const hasTenant = !PLATFORM_ROLES.includes(role) && !CONSUMER_ROLES.includes(role);
  const orgId = overrides.orgId !== undefined ? overrides.orgId : hasTenant ? `org-${role}` : null;

  userFindFirst.mockResolvedValue({
    id: "user-1",
    username: role.toLowerCase(),
    displayName: role,
    role,
    orgId,
    status: "ACTIVE",
    mustChangePassword: overrides.mustChangePassword ?? false,
    twoFactorEnabled: false,
  });
}

const PROVIDER_ADMIN_ROLES: Role[] = ["CLINIC_ADMIN", "HOSPITAL_ADMIN", "DIAGNOSTIC_ADMIN", "PHARMACY_ADMIN"];
const NON_PLATFORM_ROLES = ROLES.filter((role) => !PLATFORM_ROLES.includes(role));

beforeEach(() => {
  userFindFirst.mockReset();
  sessionFindFirst.mockClear();
});

describe("requirePlatformUser / requirePlatformPermission", () => {
  it.each(PLATFORM_ROLES)("%s may enter the platform console", async (role) => {
    signInAs(role);
    await expect(requirePlatformUser()).resolves.toMatchObject({ role });
  });

  it.each(NON_PLATFORM_ROLES)("%s is refused by the platform guard", async (role) => {
    signInAs(role);
    await expect(requirePlatformUser()).rejects.toMatchObject({
      code: "FORBIDDEN",
      details: { reason: "PLATFORM_ROLE_REQUIRED" },
    });
  });

  it.each(PROVIDER_ADMIN_ROLES)(
    "%s holds user:read for their staff but cannot use it as platform authority",
    async (role) => {
      signInAs(role);
      // The plain permission check passes — this is the grant the staff page uses…
      await expect(requirePermission("user:read")).resolves.toMatchObject({ role });
      // …and the platform guard still refuses, because the ROLE is wrong.
      await expect(requirePlatformPermission("user:read")).rejects.toMatchObject({ code: "FORBIDDEN" });
    },
  );

  it.each(PROVIDER_ADMIN_ROLES)("%s cannot verify payments at all any more", async (role) => {
    signInAs(role);
    await expect(requirePermission("payment:verify")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(requirePlatformPermission("payment:verify")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses a platform admin a permission they do not hold", async () => {
    signInAs("PLATFORM_ADMIN");
    await expect(requirePlatformPermission("plan:manage")).rejects.toMatchObject({
      code: "FORBIDDEN",
      details: { permission: "plan:manage" },
    });
  });

  it("lets the super admin do everything", async () => {
    signInAs("SUPER_ADMIN");
    await expect(requirePlatformPermission("plan:manage")).resolves.toMatchObject({ role: "SUPER_ADMIN" });
    await expect(requirePlatformPermission("payment:verify")).resolves.toBeDefined();
  });
});

describe("requireTenant / requireTenantPermission", () => {
  it.each(PROVIDER_ADMIN_ROLES)("%s gets their own orgId and nothing else", async (role) => {
    signInAs(role);
    const { orgId } = await requireTenantPermission("user:read");
    expect(orgId).toBe(`org-${role}`);
  });

  it.each(PLATFORM_ROLES)("%s has no tenant, so tenant guards refuse", async (role) => {
    signInAs(role);
    await expect(requireTenant()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it.each(["PATIENT", "FAMILY_MEMBER"] as const)("%s has no tenant either", async (role) => {
    signInAs(role);
    await expect(requireTenantPermission("patient:read")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses a provider staff member a permission only their admin holds", async () => {
    signInAs("CLINIC_STAFF");
    await expect(requireTenantPermission("user:create")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("requireUser", () => {
  it("blocks everything until a provisioned password is rotated", async () => {
    signInAs("SUPER_ADMIN", { mustChangePassword: true });
    await expect(requireUser()).rejects.toMatchObject({
      code: "FORBIDDEN",
      details: { reason: "PASSWORD_CHANGE_REQUIRED" },
    });
    await expect(requirePlatformUser()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("treats a suspended account as signed out", async () => {
    userFindFirst.mockResolvedValue({
      id: "user-1",
      username: "x",
      displayName: "x",
      role: "SUPER_ADMIN",
      orgId: null,
      status: "SUSPENDED",
      mustChangePassword: false,
      twoFactorEnabled: false,
    });
    await expect(requireUser()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("treats a revoked session as signed out", async () => {
    signInAs("SUPER_ADMIN");
    sessionFindFirst.mockResolvedValueOnce(null as never);
    await expect(requireUser()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
});
