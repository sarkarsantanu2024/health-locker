import "../scripts/load-env";

import { PrismaClient, type Prisma } from "@prisma/client";

import { encrypt } from "@/lib/crypto";
import { ROLES } from "@/shared/enums";
import { PERMISSIONS, ROLE_PERMISSIONS, type PermissionKey } from "@/shared/permissions";

/**
 * Idempotent seed. Safe to re-run: every write is an upsert keyed on a stable
 * identifier, and demo rows use fixed ids (`demo-…`) so a second run updates
 * rather than duplicates.
 *
 *   pnpm db:seed                 reference data + demo tenants/patients
 *   pnpm db:seed -- --demo-users also create demo LOGINS (never in production)
 *
 * Deliberately does NOT create an admin: accounts are admin-provisioned and the
 * first one comes from `pnpm create-super-admin`.
 */

const prisma = new PrismaClient();

const wantsDemoUsers = process.argv.includes("--demo-users");

async function seedPermissions(): Promise<void> {
  for (const [key, meta] of Object.entries(PERMISSIONS)) {
    await prisma.permission.upsert({
      where: { key },
      update: { group: meta.group, description: meta.description },
      create: { key, group: meta.group, description: meta.description },
    });
  }

  const permissions = await prisma.permission.findMany({ select: { id: true, key: true } });
  const idByKey = new Map(permissions.map((p) => [p.key as PermissionKey, p.id]));

  for (const role of ROLES) {
    const granted = ROLE_PERMISSIONS[role];
    const grantedIds = granted.map((key) => {
      const id = idByKey.get(key);
      if (!id) throw new Error(`Permission "${key}" is granted to ${role} but is not in the catalogue.`);
      return id;
    });

    // Revoking is as important as granting: a permission removed from the
    // catalogue must disappear from the database, not linger.
    await prisma.rolePermission.deleteMany({
      where: { role, permissionId: { notIn: grantedIds } },
    });

    await prisma.rolePermission.createMany({
      data: grantedIds.map((permissionId) => ({ role, permissionId })),
      skipDuplicates: true,
    });
  }

  process.stdout.write(
    `  permissions: ${permissions.length} actions across ${ROLES.length} roles\n`,
  );
}

async function seedPlans(): Promise<void> {
  const plans: Prisma.PlanCreateInput[] = [
    {
      id: "plan-patient-free",
      code: "PATIENT_FREE",
      name: "Personal — Free",
      description: "One profile, manual records, limited AI processing.",
      audience: "PATIENT",
      priceMinor: 0,
      interval: "MONTHLY",
      sortOrder: 0,
      features: { familyMembers: 1, aiPagesPerMonth: 10, storageMb: 100, emergencyCard: true },
    },
    {
      id: "plan-patient-family",
      code: "PATIENT_FAMILY",
      name: "Family",
      description: "Up to six profiles with full AI structuring and reminders.",
      audience: "PATIENT",
      priceMinor: 49900, // ₹499
      interval: "YEARLY",
      sortOrder: 1,
      features: { familyMembers: 6, aiPagesPerMonth: 200, storageMb: 2048, emergencyCard: true },
    },
    {
      id: "plan-provider-starter",
      code: "PROVIDER_STARTER",
      name: "Provider — Starter",
      description: "Single-location clinic: appointments, prescriptions, manual billing.",
      audience: "PROVIDER",
      priceMinor: 199900, // ₹1,999
      interval: "YEARLY",
      sortOrder: 2,
      features: { staffSeats: 5, locations: 1, analytics: false },
    },
    {
      id: "plan-provider-growth",
      code: "PROVIDER_GROWTH",
      name: "Provider — Growth",
      description: "Multi-department hospital or diagnostic centre with analytics.",
      audience: "PROVIDER",
      priceMinor: 599900, // ₹5,999
      interval: "YEARLY",
      sortOrder: 3,
      features: { staffSeats: 25, locations: 3, analytics: true },
    },
  ];

  for (const plan of plans) {
    await prisma.plan.upsert({ where: { code: plan.code }, update: plan, create: plan });
  }

  process.stdout.write(`  plans: ${plans.length}\n`);
}

async function seedOrganizations(): Promise<void> {
  const orgs: Prisma.OrganizationCreateInput[] = [
    {
      id: "org-platform",
      slug: "healthlocker-platform",
      name: "HealthLocker Platform",
      type: "PLATFORM",
      city: "Kolkata",
      state: "West Bengal",
    },
    {
      id: "org-demo-clinic",
      slug: "demo-clinic",
      name: "Sunrise Family Clinic",
      type: "CLINIC",
      phone: "+919800000001",
      addressLine: "12 Park Street",
      city: "Kolkata",
      state: "West Bengal",
      pincode: "700016",
      licenceNo: "WB-CLN-2024-0012",
    },
    {
      id: "org-demo-hospital",
      slug: "demo-hospital",
      name: "Meridian Multispeciality Hospital",
      type: "HOSPITAL",
      phone: "+919800000002",
      addressLine: "4 EM Bypass",
      city: "Kolkata",
      state: "West Bengal",
      pincode: "700107",
      licenceNo: "WB-HOS-2023-0451",
    },
    {
      id: "org-demo-diagnostic",
      slug: "demo-diagnostic",
      name: "Precision Diagnostics",
      type: "DIAGNOSTIC_CENTRE",
      phone: "+919800000003",
      city: "Kolkata",
      state: "West Bengal",
      pincode: "700029",
    },
    {
      id: "org-demo-pharmacy",
      slug: "demo-pharmacy",
      name: "Wellness Pharmacy",
      type: "PHARMACY",
      phone: "+919800000004",
      city: "Kolkata",
      state: "West Bengal",
      pincode: "700019",
    },
  ];

  for (const org of orgs) {
    await prisma.organization.upsert({ where: { slug: org.slug }, update: org, create: org });
  }

  // Departments and a practitioner give Phases 7–8 something real to attach to.
  const departments = [
    { id: "dept-demo-general", orgId: "org-demo-hospital", name: "General Medicine", code: "GEN" },
    { id: "dept-demo-cardio", orgId: "org-demo-hospital", name: "Cardiology", code: "CARD" },
  ];

  for (const dept of departments) {
    await prisma.department.upsert({
      where: { orgId_name: { orgId: dept.orgId, name: dept.name } },
      update: { code: dept.code },
      create: dept,
    });
  }

  await prisma.practitioner.upsert({
    where: { id: "prac-demo-anita" },
    update: {},
    create: {
      id: "prac-demo-anita",
      orgId: "org-demo-clinic",
      fullName: "Dr. Anita Roy",
      specialization: "General Physician",
      qualification: "MBBS, MD",
      registrationNo: "WBMC-51234",
      phone: "+919800000011",
    },
  });

  process.stdout.write(`  organizations: ${orgs.length} (+2 departments, 1 practitioner)\n`);
}

/**
 * Demo family: Priya owns the household and can act for her child and mother.
 * Her husband holds a VIEW-only link to her record — the asymmetry is the point,
 * because it is what the tenancy and family-access tests assert against.
 */
async function seedPatientsAndFamily(): Promise<void> {
  const patients: Prisma.PatientCreateInput[] = [
    {
      id: "demo-patient-priya",
      fullName: "Priya Sharma",
      dateOfBirth: new Date("1989-04-12"),
      gender: "FEMALE",
      bloodGroup: "O_POS",
      phone: "+919800000101",
      abhaIdEnc: encrypt("12-3456-7890-1234"),
      addressLine: "44 Southern Avenue",
      city: "Kolkata",
      state: "West Bengal",
      pincode: "700029",
      emergencyContactName: "Rahul Sharma",
      emergencyContactPhone: "+919800000102",
    },
    {
      id: "demo-patient-rahul",
      fullName: "Rahul Sharma",
      dateOfBirth: new Date("1986-11-02"),
      gender: "MALE",
      bloodGroup: "B_POS",
      phone: "+919800000102",
      city: "Kolkata",
      state: "West Bengal",
    },
    {
      id: "demo-patient-aarav",
      fullName: "Aarav Sharma",
      dateOfBirth: new Date("2018-07-21"),
      gender: "MALE",
      bloodGroup: "O_POS",
      city: "Kolkata",
      state: "West Bengal",
    },
    {
      id: "demo-patient-sunita",
      fullName: "Sunita Devi",
      dateOfBirth: new Date("1958-01-30"),
      gender: "FEMALE",
      bloodGroup: "A_POS",
      phone: "+919800000104",
      city: "Kolkata",
      state: "West Bengal",
    },
  ];

  for (const patient of patients) {
    await prisma.patient.upsert({
      where: { id: patient.id as string },
      update: patient,
      create: patient,
    });
  }

  const links = [
    { id: "demo-link-aarav", ownerId: "demo-patient-priya", memberId: "demo-patient-aarav", relationship: "CHILD" as const, accessLevel: "MANAGE" as const },
    { id: "demo-link-sunita", ownerId: "demo-patient-priya", memberId: "demo-patient-sunita", relationship: "PARENT" as const, accessLevel: "MANAGE" as const },
    { id: "demo-link-rahul", ownerId: "demo-patient-priya", memberId: "demo-patient-rahul", relationship: "SPOUSE" as const, accessLevel: "VIEW" as const },
  ];

  for (const link of links) {
    await prisma.familyLink.upsert({
      where: { ownerId_memberId: { ownerId: link.ownerId, memberId: link.memberId } },
      update: { relationship: link.relationship, accessLevel: link.accessLevel, confirmedAt: new Date() },
      create: { ...link, confirmedAt: new Date() },
    });
  }

  // Register the household with the demo clinic — this link is what scopes a
  // clinic's view of a patient, so tenant-isolation tests depend on it.
  const registrations = [
    { patientId: "demo-patient-priya", orgId: "org-demo-clinic", mrn: "SFC-0001" },
    { patientId: "demo-patient-aarav", orgId: "org-demo-clinic", mrn: "SFC-0002" },
    { patientId: "demo-patient-sunita", orgId: "org-demo-hospital", mrn: "MMH-1001" },
  ];

  for (const reg of registrations) {
    await prisma.patientOrgLink.upsert({
      where: { patientId_orgId: { patientId: reg.patientId, orgId: reg.orgId } },
      update: { mrn: reg.mrn },
      create: reg,
    });
  }

  // A free subscription so the entitlement guard (Phase 6) has something to read.
  await prisma.subscription.upsert({
    where: { id: "demo-sub-priya" },
    update: {},
    create: {
      id: "demo-sub-priya",
      planId: "plan-patient-free",
      patientId: "demo-patient-priya",
      status: "ACTIVE",
      startedAt: new Date(),
    },
  });

  process.stdout.write(
    `  patients: ${patients.length} (${links.length} family links, ${registrations.length} provider registrations)\n`,
  );
}

/** Platform collection details, encrypted — proves the crypto path end to end. */
async function seedMerchantProfile(): Promise<void> {
  await prisma.merchantPaymentProfile.upsert({
    where: { id: "merchant-platform" },
    update: {},
    create: {
      id: "merchant-platform",
      orgId: null,
      payeeName: "HealthLocker",
      upiVpaEnc: encrypt("healthlocker@upi"),
      bankNameEnc: encrypt("State Bank of India"),
      accountNoEnc: encrypt("000011112222"),
      ifscEnc: encrypt("SBIN0001234"),
      accountLast4: "2222",
      isActive: true,
    },
  });

  process.stdout.write("  merchant profile: platform (encrypted)\n");
}

/**
 * Demo LOGINS. Off by default because seeding known credentials into a live
 * database is exactly the mistake that makes "admin-provisioned only" meaningless.
 */
async function seedDemoUsers(): Promise<void> {
  const { generateTemporaryPassword, hashPassword } = await import("@/lib/auth/password");

  const demoUsers = [
    { id: "demo-user-priya", username: "priya.demo", displayName: "Priya Sharma", role: "PATIENT" as const, orgId: null, patientId: "demo-patient-priya" },
    { id: "demo-user-clinic", username: "clinic.demo", displayName: "Sunrise Clinic Admin", role: "CLINIC_ADMIN" as const, orgId: "org-demo-clinic", patientId: null },
    { id: "demo-user-pharmacy", username: "pharmacy.demo", displayName: "Wellness Pharmacy Admin", role: "PHARMACY_ADMIN" as const, orgId: "org-demo-pharmacy", patientId: null },
  ];

  const created: Array<{ username: string; password: string; role: string }> = [];

  for (const user of demoUsers) {
    const password = generateTemporaryPassword();
    const passwordHash = await hashPassword(password);

    await prisma.user.upsert({
      where: { username: user.username },
      update: { passwordHash, mustChangePassword: true, status: "ACTIVE" },
      create: {
        id: user.id,
        username: user.username,
        passwordHash,
        displayName: user.displayName,
        role: user.role,
        orgId: user.orgId,
        mustChangePassword: true,
      },
    });

    if (user.patientId) {
      await prisma.patient.update({ where: { id: user.patientId }, data: { userId: user.id } });
    }

    created.push({ username: user.username, password, role: user.role });
  }

  process.stdout.write("\n  DEMO LOGINS (shown once, all must change password at first login):\n");
  for (const u of created) {
    process.stdout.write(`    ${u.username.padEnd(16)} ${u.password.padEnd(16)} ${u.role}\n`);
  }
}

async function main(): Promise<void> {
  process.stdout.write("\nSeeding HealthLocker\n\n");

  await seedPermissions();
  await seedPlans();
  await seedOrganizations();
  await seedPatientsAndFamily();
  await seedMerchantProfile();

  if (wantsDemoUsers) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Refusing to seed demo logins with NODE_ENV=production.");
    }
    await seedDemoUsers();
  } else {
    process.stdout.write("\n  (no user accounts created — run with --demo-users for demo logins,\n");
    process.stdout.write("   or `pnpm create-super-admin --username <name>` for a real one)\n");
  }

  process.stdout.write("\nSeed complete.\n\n");
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`\nSeed failed: ${(error as Error).message}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
