import {
  Activity,
  AlertTriangle,
  FileText,
  FlaskConical,
  HeartPulse,
  Receipt,
  ScrollText,
  Stethoscope,
  Syringe,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { TimelineKind } from "@/modules/patient/timeline.service";
import { TONE_STYLES, toneFor, type Tone } from "@/ui/tone";

/**
 * THE PATIENT-FACING VOCABULARY FOR A KIND OF RECORD
 *
 * One table, so a prescription is teal with the same icon and the same word on
 * the home tiles, on the timeline, in a filter chip and on a detail header. A
 * patient learns "violet means a report" once; the only way that survives is if
 * every screen reads the answer out of here rather than choosing for itself.
 *
 * The hue is never invented locally: each kind names a key in `DOMAIN_TONE`
 * (src/ui/tone.ts) and `toneFor` resolves it. Adding a hue is a change there.
 *
 * Colour is never the only signal — everything below ships an icon *and* a
 * label, so the screens stay readable in greyscale and to a colour-blind reader
 * (WCAG 1.4.1).
 */

/** Which entry in `DOMAIN_TONE` each timeline kind borrows its hue from. */
const KIND_DOMAIN: Record<TimelineKind, string> = {
  PRESCRIPTION: "prescription",
  REPORT: "report",
  VACCINATION: "vaccination",
  // A visit is the same thing as the appointment that produced it.
  ENCOUNTER: "appointment",
  // A vital is a measurement *of the patient* rather than a document.
  VITAL: "patient",
  // Conditions and allergies are the two "watch out" kinds, and share a hue.
  CONDITION: "alert",
  ALLERGY: "alert",
  EXPENSE: "expense",
  DOCUMENT: "document",
};

export function kindTone(kind: TimelineKind): Tone {
  return toneFor(KIND_DOMAIN[kind]);
}

/** Plural, because these label filter chips and section headings. */
export const KIND_LABEL: Record<TimelineKind, string> = {
  PRESCRIPTION: "Prescriptions",
  REPORT: "Reports",
  VACCINATION: "Vaccinations",
  ENCOUNTER: "Visits",
  VITAL: "Vitals",
  CONDITION: "Conditions",
  ALLERGY: "Allergies",
  EXPENSE: "Expenses",
  DOCUMENT: "Documents",
};

/** Singular, for a single row that says what it is. */
export const KIND_SINGULAR: Record<TimelineKind, string> = {
  PRESCRIPTION: "Prescription",
  REPORT: "Report",
  VACCINATION: "Vaccination",
  ENCOUNTER: "Visit",
  VITAL: "Vital",
  CONDITION: "Condition",
  ALLERGY: "Allergy",
  EXPENSE: "Expense",
  DOCUMENT: "Document",
};

export const KIND_ICON: Record<TimelineKind, LucideIcon> = {
  PRESCRIPTION: ScrollText,
  REPORT: FlaskConical,
  VACCINATION: Syringe,
  ENCOUNTER: Stethoscope,
  VITAL: HeartPulse,
  CONDITION: Activity,
  ALLERGY: AlertTriangle,
  EXPENSE: Receipt,
  DOCUMENT: FileText,
};

/**
 * The tinted square that opens a record row. Carries the icon, so the hue is
 * reinforced rather than relied upon, and an accessible name, so a screen reader
 * hears "Prescription" where a sighted reader sees teal.
 */
export function KindChip({ kind, className }: { kind: TimelineKind; className?: string }) {
  const Icon = KIND_ICON[kind];
  const style = TONE_STYLES[kindTone(kind)];

  return (
    <span
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-2xl",
        style.chipSolid,
        className,
      )}
    >
      <Icon aria-hidden className="size-5" />
      <span className="sr-only">{KIND_SINGULAR[kind]}</span>
    </span>
  );
}
