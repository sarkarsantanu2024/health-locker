import { prisma } from "@/lib/db";
import { MINOR_UNITS_PER_MAJOR } from "@/shared/enums";

/**
 * The unified health timeline: one ordered feed merged from every clinical and
 * financial source.
 *
 * Each source is queried separately and normalised to a common shape. A single
 * SQL union would be faster but would have to be rewritten every time a domain
 * gains a column; this stays readable and each query is individually indexed on
 * `(patientId, <date>)`.
 */

export const TIMELINE_KINDS = [
  "PRESCRIPTION",
  "REPORT",
  "VACCINATION",
  "ENCOUNTER",
  "VITAL",
  "CONDITION",
  "ALLERGY",
  "EXPENSE",
  "DOCUMENT",
] as const;

export type TimelineKind = (typeof TIMELINE_KINDS)[number];

export interface TimelineEntry {
  id: string;
  kind: TimelineKind;
  title: string;
  /** One line of supporting detail, already humanised. */
  detail?: string;
  occurredAt: Date;
  /** Provider organization, when the entry came from one. */
  source?: string;
  /** Set when the entry carries a clinical warning worth surfacing. */
  flag?: "NORMAL" | "ATTENTION" | "CRITICAL";
  /** True when AI produced this and nobody has confirmed it yet. */
  needsReview?: boolean;
}

export interface TimelineFilter {
  kinds?: TimelineKind[];
  from?: Date;
  to?: Date;
  /** Free-text match against the entry title. */
  query?: string;
  limit?: number;
}

function dateRange(filter: TimelineFilter) {
  if (!filter.from && !filter.to) return undefined;
  return { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lte: filter.to } : {}) };
}

function wants(filter: TimelineFilter, kind: TimelineKind): boolean {
  return !filter.kinds?.length || filter.kinds.includes(kind);
}

function formatMoney(minor: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(minor / MINOR_UNITS_PER_MAJOR);
}

/**
 * Builds the timeline for ONE patient. The caller must already have proved
 * access — see modules/patient/context.ts. This function never checks
 * permissions itself, so it must never be called with an unvalidated id.
 */
export async function getTimeline(
  patientId: string,
  filter: TimelineFilter = {},
): Promise<TimelineEntry[]> {
  const occurred = dateRange(filter);
  const limit = filter.limit ?? 200;
  const base = { patientId, deletedAt: null };

  const [prescriptions, reports, vaccinations, encounters, vitals, conditions, allergies, expenses, documents] =
    await Promise.all([
      wants(filter, "PRESCRIPTION")
        ? prisma.prescription.findMany({
            where: { ...base, ...(occurred ? { issuedAt: occurred } : {}) },
            orderBy: { issuedAt: "desc" },
            take: limit,
            select: {
              id: true,
              issuedAt: true,
              prescriberName: true,
              org: { select: { name: true } },
              practitioner: { select: { fullName: true } },
              items: { where: { deletedAt: null }, select: { drugName: true, confirmedAt: true, aiConfidence: true } },
            },
          })
        : [],

      wants(filter, "REPORT")
        ? prisma.diagnosticReport.findMany({
            where: { ...base, ...(occurred ? { reportedAt: occurred } : {}) },
            orderBy: { reportedAt: "desc" },
            take: limit,
            select: {
              id: true,
              title: true,
              reportedAt: true,
              org: { select: { name: true } },
              findings: { select: { flag: true } },
            },
          })
        : [],

      wants(filter, "VACCINATION")
        ? prisma.vaccination.findMany({
            where: { ...base, administeredAt: { not: null, ...(occurred ?? {}) } },
            orderBy: { administeredAt: "desc" },
            take: limit,
            select: { id: true, vaccineName: true, doseNumber: true, administeredAt: true, administeredBy: true },
          })
        : [],

      wants(filter, "ENCOUNTER")
        ? prisma.encounter.findMany({
            where: { ...base, ...(occurred ? { occurredAt: occurred } : {}) },
            orderBy: { occurredAt: "desc" },
            take: limit,
            select: {
              id: true,
              occurredAt: true,
              type: true,
              diagnosis: true,
              chiefComplaint: true,
              org: { select: { name: true } },
              practitioner: { select: { fullName: true } },
            },
          })
        : [],

      wants(filter, "VITAL")
        ? prisma.vitalReading.findMany({
            where: { ...base, ...(occurred ? { recordedAt: occurred } : {}) },
            orderBy: { recordedAt: "desc" },
            take: limit,
            select: { id: true, type: true, value: true, unit: true, recordedAt: true },
          })
        : [],

      wants(filter, "CONDITION")
        ? prisma.condition.findMany({
            where: { ...base, diagnosedAt: { not: null, ...(occurred ?? {}) } },
            orderBy: { diagnosedAt: "desc" },
            take: limit,
            select: { id: true, name: true, status: true, diagnosedAt: true },
          })
        : [],

      wants(filter, "ALLERGY")
        ? prisma.allergy.findMany({
            where: { ...base, ...(occurred ? { notedAt: occurred } : {}) },
            orderBy: { notedAt: "desc" },
            take: limit,
            select: { id: true, substance: true, reaction: true, severity: true, notedAt: true },
          })
        : [],

      wants(filter, "EXPENSE")
        ? prisma.expense.findMany({
            where: { ...base, ...(occurred ? { incurredAt: occurred } : {}) },
            orderBy: { incurredAt: "desc" },
            take: limit,
            select: { id: true, category: true, amountMinor: true, vendor: true, incurredAt: true },
          })
        : [],

      wants(filter, "DOCUMENT")
        ? prisma.document.findMany({
            where: { ...base, status: { in: ["UPLOADED", "PROCESSING", "PROCESSED"] }, ...(occurred ? { createdAt: occurred } : {}) },
            orderBy: { createdAt: "desc" },
            take: limit,
            select: { id: true, fileName: true, kind: true, status: true, createdAt: true },
          })
        : [],
    ]);

  const entries: TimelineEntry[] = [
    ...prescriptions.map((p): TimelineEntry => {
      const drugs = p.items.map((i) => i.drugName);
      return {
        id: `prescription:${p.id}`,
        kind: "PRESCRIPTION",
        title: drugs.length ? drugs.slice(0, 3).join(", ") + (drugs.length > 3 ? ` +${drugs.length - 3} more` : "") : "Prescription",
        detail: `${p.items.length} medicine${p.items.length === 1 ? "" : "s"}`,
        occurredAt: p.issuedAt,
        source: p.org?.name ?? p.practitioner?.fullName ?? p.prescriberName ?? undefined,
        // Anything AI-extracted that a human has not yet confirmed.
        needsReview: p.items.some((i) => i.aiConfidence !== null && i.confirmedAt === null),
      };
    }),

    ...reports.map((r): TimelineEntry => {
      const critical = r.findings.some((f) => f.flag === "CRITICAL");
      const abnormal = r.findings.some((f) => f.flag === "LOW" || f.flag === "HIGH");
      return {
        id: `report:${r.id}`,
        kind: "REPORT",
        title: r.title,
        detail: r.findings.length ? `${r.findings.length} value${r.findings.length === 1 ? "" : "s"}` : undefined,
        occurredAt: r.reportedAt,
        source: r.org?.name ?? undefined,
        flag: critical ? "CRITICAL" : abnormal ? "ATTENTION" : "NORMAL",
      };
    }),

    ...vaccinations.map((v): TimelineEntry => ({
      id: `vaccination:${v.id}`,
      kind: "VACCINATION",
      title: v.vaccineName,
      detail: v.doseNumber ? `Dose ${v.doseNumber}` : undefined,
      occurredAt: v.administeredAt!,
      source: v.administeredBy ?? undefined,
    })),

    ...encounters.map((e): TimelineEntry => ({
      id: `encounter:${e.id}`,
      kind: "ENCOUNTER",
      title: e.diagnosis || e.chiefComplaint || `${e.type.replace(/_/g, " ").toLowerCase()} visit`,
      detail: e.practitioner?.fullName ?? undefined,
      occurredAt: e.occurredAt,
      source: e.org?.name ?? undefined,
    })),

    ...vitals.map((v): TimelineEntry => ({
      id: `vital:${v.id}`,
      kind: "VITAL",
      title: `${v.type.replace(/_/g, " ").toLowerCase()}: ${v.value}${v.unit ? ` ${v.unit}` : ""}`,
      occurredAt: v.recordedAt,
    })),

    ...conditions.map((c): TimelineEntry => ({
      id: `condition:${c.id}`,
      kind: "CONDITION",
      title: c.name,
      detail: c.status.replace(/_/g, " ").toLowerCase(),
      occurredAt: c.diagnosedAt!,
      flag: c.status === "ACTIVE" ? "ATTENTION" : "NORMAL",
    })),

    ...allergies.map((a): TimelineEntry => ({
      id: `allergy:${a.id}`,
      kind: "ALLERGY",
      title: `Allergy: ${a.substance}`,
      detail: a.reaction ?? undefined,
      occurredAt: a.notedAt,
      flag: a.severity === "CRITICAL" || a.severity === "HIGH" ? "CRITICAL" : "ATTENTION",
    })),

    ...expenses.map((e): TimelineEntry => ({
      id: `expense:${e.id}`,
      kind: "EXPENSE",
      title: `${formatMoney(e.amountMinor)} · ${e.category.replace(/_/g, " ").toLowerCase()}`,
      detail: e.vendor ?? undefined,
      occurredAt: e.incurredAt,
    })),

    ...documents.map((d): TimelineEntry => ({
      id: `document:${d.id}`,
      kind: "DOCUMENT",
      title: d.fileName,
      detail: d.kind.replace(/_/g, " ").toLowerCase(),
      occurredAt: d.createdAt,
      needsReview: d.status === "PROCESSING",
    })),
  ];

  const needle = filter.query?.trim().toLowerCase();
  const filtered = needle
    ? entries.filter(
        (e) => e.title.toLowerCase().includes(needle) || e.detail?.toLowerCase().includes(needle),
      )
    : entries;

  // Merge-sort newest first. Each source was already capped at `limit`, so the
  // merged list is capped again to keep the page bounded.
  return filtered.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime()).slice(0, limit);
}

/** Groups entries by calendar day for rendering. */
export function groupByDay(entries: TimelineEntry[]): Array<{ day: string; entries: TimelineEntry[] }> {
  const groups = new Map<string, TimelineEntry[]>();

  for (const entry of entries) {
    const day = entry.occurredAt.toISOString().slice(0, 10);
    groups.set(day, [...(groups.get(day) ?? []), entry]);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([day, dayEntries]) => ({ day, entries: dayEntries }));
}
