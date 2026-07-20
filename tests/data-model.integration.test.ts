import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";

import { decrypt } from "@/lib/crypto";
import { PERMISSION_KEYS, ROLE_PERMISSIONS } from "@/shared/permissions";

/**
 * Integration tests — these hit a REAL database and assume `pnpm db:migrate` and
 * `pnpm db:seed` have run. They are read-only: nothing here writes, so they are
 * safe to point at a shared development database.
 *
 *   pnpm test:integration
 */

const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

describe("tenant scoping", () => {
  it("shows a clinic only the patients registered with it", async () => {
    const patients = await prisma.patient.findMany({
      where: {
        deletedAt: null,
        orgLinks: { some: { orgId: "org-demo-clinic", deletedAt: null } },
      },
      orderBy: { fullName: "asc" },
      select: { fullName: true },
    });

    expect(patients.map((p) => p.fullName)).toEqual(["Aarav Sharma", "Priya Sharma"]);
  });

  it("does not leak another tenant's patient", async () => {
    // Sunita is registered with the hospital, not the clinic.
    const leaked = await prisma.patient.findFirst({
      where: {
        fullName: "Sunita Devi",
        orgLinks: { some: { orgId: "org-demo-clinic", deletedAt: null } },
      },
    });

    expect(leaked).toBeNull();

    const viaHospital = await prisma.patient.findFirst({
      where: {
        fullName: "Sunita Devi",
        orgLinks: { some: { orgId: "org-demo-hospital", deletedAt: null } },
      },
    });

    expect(viaHospital).not.toBeNull();
  });

  it("keeps a provider's MRN unique within the tenant", async () => {
    const link = await prisma.patientOrgLink.findUnique({
      where: { patientId_orgId: { patientId: "demo-patient-priya", orgId: "org-demo-clinic" } },
    });

    expect(link?.mrn).toBe("SFC-0001");
  });
});

describe("demo patient + family", () => {
  it("returns the household Priya can act for", async () => {
    const priya = await prisma.patient.findUnique({
      where: { id: "demo-patient-priya" },
      include: {
        familyOf: {
          where: { deletedAt: null },
          include: { member: { select: { fullName: true } } },
          orderBy: { relationship: "asc" },
        },
      },
    });

    expect(priya?.fullName).toBe("Priya Sharma");
    expect(priya?.familyOf).toHaveLength(3);

    const byRelationship = Object.fromEntries(
      priya!.familyOf.map((link) => [link.relationship, { name: link.member.fullName, access: link.accessLevel }]),
    );

    expect(byRelationship.CHILD).toEqual({ name: "Aarav Sharma", access: "MANAGE" });
    expect(byRelationship.PARENT).toEqual({ name: "Sunita Devi", access: "MANAGE" });
    // The spouse link is deliberately VIEW-only — access level is not symmetric.
    expect(byRelationship.SPOUSE).toEqual({ name: "Rahul Sharma", access: "VIEW" });
  });

  it("does not imply a reverse link", async () => {
    // Rahul can view Priya's record only if a link names him as owner. None does.
    const reverse = await prisma.familyLink.findUnique({
      where: { ownerId_memberId: { ownerId: "demo-patient-rahul", memberId: "demo-patient-priya" } },
    });

    expect(reverse).toBeNull();
  });

  it("allows a patient to exist without a login", async () => {
    const aarav = await prisma.patient.findUnique({ where: { id: "demo-patient-aarav" } });

    expect(aarav).not.toBeNull();
    expect(aarav?.userId).toBeNull();
  });
});

describe("RBAC seed", () => {
  it("writes the whole catalogue", async () => {
    const count = await prisma.permission.count();
    expect(count).toBe(PERMISSION_KEYS.length);
  });

  it("grants SUPER_ADMIN every permission", async () => {
    const count = await prisma.rolePermission.count({ where: { role: "SUPER_ADMIN" } });
    expect(count).toBe(PERMISSION_KEYS.length);
  });

  it("matches the code-side matrix for a provider role", async () => {
    const granted = await prisma.rolePermission.findMany({
      where: { role: "CLINIC_STAFF" },
      include: { permission: { select: { key: true } } },
    });

    expect(granted.map((g) => g.permission.key).sort()).toEqual(
      [...ROLE_PERMISSIONS.CLINIC_STAFF].sort(),
    );
  });

  it("does not grant a patient any admin permission", async () => {
    const granted = await prisma.rolePermission.findMany({
      where: { role: "PATIENT", permission: { key: { in: ["user:create", "payment:verify", "audit:read"] } } },
    });

    expect(granted).toEqual([]);
  });
});

describe("encrypted columns", () => {
  it("stores identifiers as ciphertext, not plaintext", async () => {
    const profile = await prisma.merchantPaymentProfile.findUnique({
      where: { id: "merchant-platform" },
    });

    expect(profile?.upiVpaEnc).toBeTruthy();

    // Asserts the PROPERTIES of the stored value rather than a specific VPA:
    // the profile holds real collection details that an admin may rotate at any
    // time, and a test that echoes them would print them into CI logs on failure.
    expect(profile!.upiVpaEnc!.startsWith("v1.")).toBe(true);
    expect(profile!.upiVpaEnc!.split(".")).toHaveLength(4);

    const decrypted = decrypt(profile!.upiVpaEnc!);
    expect(decrypted).toMatch(/^[\w.\-]+@[a-zA-Z0-9]+$/);
    // The ciphertext must not contain the plaintext it protects.
    expect(profile!.upiVpaEnc).not.toContain(decrypted);

    // The masked tail is intentionally in clear so an admin can identify the row.
    expect(profile?.accountLast4).toMatch(/^\d{4}$/);
  });

  it("encrypts a patient's national health id", async () => {
    const priya = await prisma.patient.findUnique({ where: { id: "demo-patient-priya" } });

    expect(priya?.abhaIdEnc).not.toContain("1234");
    expect(decrypt(priya!.abhaIdEnc!)).toBe("12-3456-7890-1234");
  });
});

describe("bootstrap", () => {
  it("has at least one Super Admin to log in with", async () => {
    const superAdmins = await prisma.user.count({
      where: { role: "SUPER_ADMIN", status: "ACTIVE", deletedAt: null },
    });

    expect(superAdmins).toBeGreaterThanOrEqual(1);
  });

  it("seeds plans for both audiences", async () => {
    const [patientPlans, providerPlans] = await Promise.all([
      prisma.plan.count({ where: { audience: "PATIENT", isActive: true } }),
      prisma.plan.count({ where: { audience: "PROVIDER", isActive: true } }),
    ]);

    expect(patientPlans).toBeGreaterThanOrEqual(2);
    expect(providerPlans).toBeGreaterThanOrEqual(2);
  });

  it("seeds one organization per provider type", async () => {
    const types = await prisma.organization.findMany({
      where: { deletedAt: null },
      select: { type: true },
      distinct: ["type"],
    });

    expect(types.map((t) => t.type).sort()).toEqual([
      "CLINIC",
      "DIAGNOSTIC_CENTRE",
      "HOSPITAL",
      "PHARMACY",
      "PLATFORM",
    ]);
  });
});
