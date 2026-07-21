import { humanizeEnum } from "@/lib/format";
import { Badge } from "@/ui/badge";

/**
 * One place that decides what colour a status is.
 *
 * Scattering these ternaries across screens is how "cancelled" ends up green on
 * one page and red on another. Anything unmapped falls back to neutral rather
 * than throwing — a new enum value should look plain, not break the page.
 */
const TONES: Record<string, "neutral" | "primary" | "success" | "warning" | "danger" | "info"> = {
  // appointments
  REQUESTED: "info",
  SCHEDULED: "primary",
  CHECKED_IN: "info",
  IN_PROGRESS: "warning",
  COMPLETED: "success",
  CANCELLED: "neutral",
  NO_SHOW: "danger",

  // invoices & payments
  DRAFT: "neutral",
  ISSUED: "warning",
  PAID: "success",
  VOID: "neutral",
  OVERDUE: "danger",
  PENDING: "warning",
  SUBMITTED: "info",
  APPROVED: "success",
  REJECTED: "danger",
  EXPIRED: "neutral",

  // reports
  ORDERED: "neutral",
  SAMPLE_COLLECTED: "info",
  AWAITING_VERIFICATION: "warning",
  PUBLISHED: "success",

  // bookings
  BOOKED: "primary",
  SAMPLE_PENDING: "warning",
  PROCESSING: "info",
  REPORT_READY: "success",

  // admissions
  ADMITTED: "primary",
  DISCHARGED: "success",
  TRANSFERRED: "info",
  DECEASED: "neutral",

  // orders
  PLACED: "primary",
  VERIFIED: "info",
  PACKED: "info",
  DISPATCHED: "warning",
  DELIVERED: "success",
  RETURNED: "danger",

  // severity / flags
  LOW: "info",
  MEDIUM: "warning",
  HIGH: "danger",
  CRITICAL: "danger",
  NORMAL: "success",
  UNKNOWN: "neutral",

  // conditions & schedules
  ACTIVE: "primary",
  RESOLVED: "success",
  IN_REMISSION: "info",
  SUSPECTED: "warning",
  PAUSED: "warning",
  STOPPED: "neutral",

  // doses
  DUE: "warning",
  TAKEN: "success",
  SKIPPED: "neutral",
  MISSED: "danger",
};

export function StatusBadge({ value }: { value: string }) {
  return <Badge tone={TONES[value] ?? "neutral"}>{humanizeEnum(value)}</Badge>;
}
