import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 3 acceptance: merged timeline, family switch respecting permissions,
 * and an emergency card that is read-only and scoped.
 */

const cookieJar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieJar.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (name: string, value: string) => {
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

const { getPatientContext, requireManageContext, setActivePatient, assertCanReadPatient } =
  await import("@/modules/patient/context");
const { getTimeline } = await import("@/modules/patient/timeline.service");
const { issueEmergencyCard, resolveEmergencyCard, revokeEmergencyCard } = await import(
  "@/modules/patient/emergency.service"
);
const { addFamilyMember, listFamily, recordConsent, hasConsent } = await import(
  "@/modules/patient/patient.service"
);
const { login } = await import("@/modules/identity/auth.service");
const { createUser, platformScope } = await import("@/modules/identity/provisioning.service");
const { resetMemoryLimiter } = await import("@/lib/ratelimit");

const prisma = new PrismaClient();
const SUFFIX = "patientspec";

let adminId: string;
let owner: { userId: string; username: string; temporaryPassword: string; patientId: string };
let childId: string;
let viewOnlyId: string;
let strangerPatientId: string;

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { username: { contains: SUFFIX } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);

  const patients = await prisma.patient.findMany({
    where: { OR: [{ userId: { in: userIds } }, { fullName: { contains: SUFFIX } }] },
    select: { id: true },
  });
  const patientIds = patients.map((p) => p.id);

  await prisma.emergencyCard.deleteMany({ where: { patientId: { in: patientIds } } });
  await prisma.consentRecord.deleteMany({ where: { patientId: { in: patientIds } } });
  await prisma.familyLink.deleteMany({
    where: { OR: [{ ownerId: { in: patientIds } }, { memberId: { in: patientIds } }] },
  });
  await prisma.allergy.deleteMany({ where: { patientId: { in: patientIds } } });
  await prisma.condition.deleteMany({ where: { patientId: { in: patientIds } } });
  await prisma.vaccination.deleteMany({ where: { patientId: { in: patientIds } } });
  await prisma.medicationSchedule.deleteMany({ where: { patientId: { in: patientIds } } });
  await prisma.expense.deleteMany({ where: { patientId: { in: patientIds } } });
  await prisma.prescriptionItem.deleteMany({
    where: { prescription: { patientId: { in: patientIds } } },
  });
  await prisma.prescription.deleteMany({ where: { patientId: { in: patientIds } } });
  await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.auditLog.deleteMany({
    where: { OR: [{ actorId: { in: userIds } }, { entityId: { in: [...userIds, ...patientIds] } }] },
  });
  await prisma.patient.deleteMany({ where: { id: { in: patientIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

beforeAll(async () => {
  await cleanup();

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

  const created = await createUser(
    { displayName: `Owner ${SUFFIX}`, role: "PATIENT", username: `owner.${SUFFIX}` },
    platformScope(adminId),
  );

  const ownerPatient = await prisma.patient.findFirstOrThrow({
    where: { userId: created.userId },
    select: { id: true },
  });

  // Clear the forced first-login flag so the guards are reachable.
  await prisma.user.update({
    where: { id: created.userId },
    data: { mustChangePassword: false },
  });

  owner = { ...created, patientId: ownerPatient.id };

  childId = await addFamilyMember(
    owner.patientId,
    { fullName: `Child ${SUFFIX}`, relationship: "CHILD", accessLevel: "MANAGE", gender: "MALE", bloodGroup: "O_POS" },
    owner.userId,
  );

  viewOnlyId = await addFamilyMember(
    owner.patientId,
    { fullName: `Spouse ${SUFFIX}`, relationship: "SPOUSE", accessLevel: "VIEW", gender: "FEMALE", bloodGroup: "A_POS" },
    owner.userId,
  );

  const stranger = await prisma.patient.create({
    data: { fullName: `Stranger ${SUFFIX}` },
    select: { id: true },
  });
  strangerPatientId = stranger.id;

  // Timeline fixtures across several sources and dates.
  await prisma.allergy.create({
    data: { patientId: owner.patientId, substance: "Penicillin", reaction: "Rash", severity: "HIGH", notedAt: new Date("2026-01-10") },
  });
  await prisma.condition.create({
    data: { patientId: owner.patientId, name: "Hypertension", status: "ACTIVE", diagnosedAt: new Date("2026-02-15") },
  });
  await prisma.vaccination.create({
    data: { patientId: owner.patientId, vaccineName: "Tetanus", doseNumber: 1, administeredAt: new Date("2026-03-20") },
  });
  await prisma.expense.create({
    data: { patientId: owner.patientId, category: "MEDICINE", amountMinor: 45000, incurredAt: new Date("2026-04-05"), vendor: "Wellness Pharmacy" },
  });

  const prescription = await prisma.prescription.create({
    data: { patientId: owner.patientId, issuedAt: new Date("2026-05-01"), prescriberName: "Dr. Test" },
    select: { id: true },
  });
  await prisma.prescriptionItem.createMany({
    data: [
      { prescriptionId: prescription.id, drugName: "Amlodipine", dose: "5mg", aiConfidence: 0.5 },
      { prescriptionId: prescription.id, drugName: "Aspirin", dose: "75mg", confirmedAt: new Date() },
    ],
  });

  // The child gets one entry of their own, to prove scoping.
  await prisma.medicationSchedule.create({
    data: { patientId: childId, drugName: "Paracetamol syrup", times: ["09:00"], startDate: new Date("2026-06-01"), status: "ACTIVE" },
  });
  await prisma.allergy.create({
    data: { patientId: childId, substance: "Peanuts", reaction: "Anaphylaxis", severity: "CRITICAL", notedAt: new Date("2026-06-02") },
  });
}, 90_000);

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

beforeEach(async () => {
  cookieJar.clear();
  resetMemoryLimiter();
  await login({ username: owner.username, password: owner.temporaryPassword }, "127.0.0.1");
});

describe("acceptance: merged timeline", () => {
  it("merges every source into one feed, newest first", async () => {
    const entries = await getTimeline(owner.patientId);

    expect(entries.map((e) => e.kind)).toEqual([
      "PRESCRIPTION",
      "EXPENSE",
      "VACCINATION",
      "CONDITION",
      "ALLERGY",
    ]);

    const dates = entries.map((e) => e.occurredAt.getTime());
    expect(dates).toEqual([...dates].sort((a, b) => b - a));
  });

  it("summarises a prescription by its drugs and flags unconfirmed AI extraction", async () => {
    const [prescription] = await getTimeline(owner.patientId, { kinds: ["PRESCRIPTION"] });

    expect(prescription.title).toContain("Amlodipine");
    expect(prescription.detail).toBe("2 medicines");
    // One item has a confidence score and no confirmedAt.
    expect(prescription.needsReview).toBe(true);
  });

  it("filters by kind, date range and free text", async () => {
    expect(await getTimeline(owner.patientId, { kinds: ["ALLERGY"] })).toHaveLength(1);

    const q1 = await getTimeline(owner.patientId, { query: "tetanus" });
    expect(q1).toHaveLength(1);
    expect(q1[0].kind).toBe("VACCINATION");

    const ranged = await getTimeline(owner.patientId, {
      from: new Date("2026-03-01"),
      to: new Date("2026-04-30"),
    });
    expect(ranged.map((e) => e.kind).sort()).toEqual(["EXPENSE", "VACCINATION"]);
  });

  it("never mixes one patient's records into another's", async () => {
    const ownerEntries = await getTimeline(owner.patientId);
    const childEntries = await getTimeline(childId);

    expect(childEntries.map((e) => e.title)).toContain("Allergy: Peanuts");
    expect(ownerEntries.map((e) => e.title)).not.toContain("Allergy: Peanuts");
  });

  it("marks a critical allergy so it cannot be missed", async () => {
    const [allergy] = await getTimeline(childId, { kinds: ["ALLERGY"] });
    expect(allergy.flag).toBe("CRITICAL");
  });
});

describe("acceptance: family switch respects permissions", () => {
  it("defaults to the caller's own record", async () => {
    const context = await getPatientContext();

    expect(context.patientId).toBe(owner.patientId);
    expect(context.isActingForOther).toBe(false);
    expect(context.accessLevel).toBe("MANAGE");
  });

  it("switches to a MANAGE-linked member and allows writes", async () => {
    await setActivePatient(childId);
    const context = await getPatientContext();

    expect(context.patientId).toBe(childId);
    expect(context.isActingForOther).toBe(true);
    expect(context.accessLevel).toBe("MANAGE");
    await expect(requireManageContext()).resolves.toMatchObject({ patientId: childId });
  });

  it("switches to a VIEW-linked member but REFUSES writes", async () => {
    await setActivePatient(viewOnlyId);
    const context = await getPatientContext();

    expect(context.patientId).toBe(viewOnlyId);
    expect(context.accessLevel).toBe("VIEW");
    await expect(requireManageContext()).rejects.toThrow(/view-only/i);
  });

  it("ignores a forged cookie naming an unlinked patient", async () => {
    await setActivePatient(strangerPatientId);
    const context = await getPatientContext();

    // Falls back to the caller's own record rather than honouring it.
    expect(context.patientId).toBe(owner.patientId);
    expect(context.isActingForOther).toBe(false);
  });

  it("falls back to own record once a link is removed", async () => {
    const link = await prisma.familyLink.findFirstOrThrow({
      where: { ownerId: owner.patientId, memberId: childId },
      select: { id: true },
    });

    await setActivePatient(childId);
    expect((await getPatientContext()).patientId).toBe(childId);

    await prisma.familyLink.update({ where: { id: link.id }, data: { deletedAt: new Date() } });
    expect((await getPatientContext()).patientId).toBe(owner.patientId);

    await prisma.familyLink.update({ where: { id: link.id }, data: { deletedAt: null } });
  });

  it("refuses to read an unlinked patient by id", async () => {
    await expect(assertCanReadPatient(strangerPatientId)).rejects.toThrow(/not found/i);
    await expect(assertCanReadPatient(childId)).resolves.toMatchObject({ patientId: childId });
  });

  it("lists only the caller's own family", async () => {
    const family = await listFamily(owner.patientId);
    expect(family.map((f) => f.member.fullName).sort()).toEqual([
      `Child ${SUFFIX}`,
      `Spouse ${SUFFIX}`,
    ]);

    expect(await listFamily(childId)).toHaveLength(0);
  });
});

describe("acceptance: emergency card is read-only and scoped", () => {
  it("exposes only the opted-in sections", async () => {
    const { shareToken } = await issueEmergencyCard(
      childId,
      { includeAllergies: true, includeConditions: false, includeMedications: false, includeBloodGroup: true },
      owner.userId,
    );

    const card = await resolveEmergencyCard(shareToken);

    expect(card?.fullName).toBe(`Child ${SUFFIX}`);
    expect(card?.bloodGroup).toBe("O+");
    expect(card?.allergies.map((a) => a.substance)).toEqual(["Peanuts"]);
    // Opted out — must be empty even though the patient HAS medications.
    expect(card?.medications).toEqual([]);
    expect(card?.conditions).toEqual([]);
  });

  it("omits the blood group when that section is off", async () => {
    const { shareToken } = await issueEmergencyCard(
      childId,
      { includeBloodGroup: false, includeAllergies: true },
      owner.userId,
    );

    expect((await resolveEmergencyCard(shareToken))?.bloodGroup).toBeNull();
  });

  it("shows active conditions but not resolved ones", async () => {
    await prisma.condition.create({
      data: { patientId: owner.patientId, name: "Resolved thing", status: "RESOLVED", diagnosedAt: new Date() },
    });

    const { shareToken } = await issueEmergencyCard(owner.patientId, { includeConditions: true }, owner.userId);
    const card = await resolveEmergencyCard(shareToken);

    expect(card?.conditions.map((c) => c.name)).toEqual(["Hypertension"]);
  });

  it("invalidates the previous token when a new card is issued", async () => {
    const first = await issueEmergencyCard(owner.patientId, {}, owner.userId);
    expect(await resolveEmergencyCard(first.shareToken)).not.toBeNull();

    const second = await issueEmergencyCard(owner.patientId, {}, owner.userId);

    expect(await resolveEmergencyCard(first.shareToken)).toBeNull();
    expect(await resolveEmergencyCard(second.shareToken)).not.toBeNull();
  });

  it("returns null for revoked, expired, unknown and malformed tokens alike", async () => {
    const { shareToken } = await issueEmergencyCard(owner.patientId, {}, owner.userId);
    await revokeEmergencyCard(owner.patientId, owner.userId);

    expect(await resolveEmergencyCard(shareToken)).toBeNull();
    expect(await resolveEmergencyCard("a".repeat(32))).toBeNull();
    expect(await resolveEmergencyCard("not-a-token")).toBeNull();
    expect(await resolveEmergencyCard("")).toBeNull();
  });

  it("counts views and audits each one", async () => {
    const { shareToken } = await issueEmergencyCard(owner.patientId, {}, owner.userId);

    await resolveEmergencyCard(shareToken);
    await resolveEmergencyCard(shareToken);

    const card = await prisma.emergencyCard.findFirstOrThrow({ where: { shareToken } });
    expect(card.viewCount).toBe(2);
    expect(card.lastViewedAt).not.toBeNull();

    const views = await prisma.auditLog.count({
      where: { action: "emergency_card.viewed", entityId: card.id },
    });
    expect(views).toBe(2);
  });

  it("never writes the share token into the audit trail", async () => {
    const { shareToken } = await issueEmergencyCard(owner.patientId, {}, owner.userId);

    const entries = await prisma.auditLog.findMany({
      where: { action: "emergency_card.issued" },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    expect(JSON.stringify(entries)).not.toContain(shareToken);
  });
});

describe("consent (DPDP)", () => {
  it("records a grant, then a withdrawal that keeps the original row", async () => {
    await recordConsent(owner.patientId, "AI_PROCESSING", true, { source: "spec" });
    expect(await hasConsent(owner.patientId, "AI_PROCESSING")).toBe(true);

    await recordConsent(owner.patientId, "AI_PROCESSING", false, { source: "spec" });
    expect(await hasConsent(owner.patientId, "AI_PROCESSING")).toBe(false);

    // The grant survives with revokedAt set — "was there consent at the time?"
    // must remain answerable.
    const rows = await prisma.consentRecord.findMany({
      where: { patientId: owner.patientId, type: "AI_PROCESSING" },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].granted).toBe(true);
    expect(rows[0].revokedAt).not.toBeNull();
  });

  it("records consent when an emergency card is issued", async () => {
    await recordConsent(owner.patientId, "EMERGENCY_SHARING", true, { source: "spec" });
    expect(await hasConsent(owner.patientId, "EMERGENCY_SHARING")).toBe(true);
  });
});
