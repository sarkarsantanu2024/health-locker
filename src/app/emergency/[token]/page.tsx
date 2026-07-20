import { AlertTriangle, HeartPulse, Phone } from "lucide-react";
import type { Metadata } from "next";

import { resolveEmergencyCard } from "@/modules/patient/emergency.service";

export const dynamic = "force-dynamic";

/**
 * PUBLIC, read-only emergency card. No session, no cookies, no navigation into
 * the app — a first responder holding a phone must be able to read it in seconds.
 *
 * Deliberately never indexed, and it exposes no way to reach anything else: the
 * token grants sight of this card and nothing more.
 */
export const metadata: Metadata = {
  title: "Emergency information",
  robots: { index: false, follow: false, nocache: true },
};

function formatDate(value: Date | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(value);
}

function age(dateOfBirth: Date | null): string | null {
  if (!dateOfBirth) return null;
  const years = Math.floor((Date.now() - dateOfBirth.getTime()) / 31_557_600_000);
  return years >= 0 && years < 130 ? `${years} years` : null;
}

export default async function EmergencyCardPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const card = await resolveEmergencyCard((await params).token);

  // Unknown, revoked and expired all render identically, so a token cannot be
  // probed for validity.
  if (!card) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
        <AlertTriangle aria-hidden className="size-8 text-muted-foreground" />
        <h1 className="text-xl font-semibold">This card is not available</h1>
        <p className="text-sm text-muted-foreground">
          The link may have been revoked or replaced. Ask the card holder for a current one.
        </p>
      </main>
    );
  }

  const years = age(card.dateOfBirth);

  return (
    <main className="mx-auto max-w-md px-4 py-6">
      <div className="mb-4 rounded-2xl bg-danger p-4 text-white">
        <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide">
          <HeartPulse aria-hidden className="size-5" />
          Emergency information
        </p>
        <h1 className="mt-2 text-2xl font-bold">{card.fullName}</h1>
        <p className="mt-0.5 text-sm opacity-90">
          {[years, card.dateOfBirth ? formatDate(card.dateOfBirth) : null].filter(Boolean).join(" · ")}
        </p>
      </div>

      {card.bloodGroup && card.bloodGroup !== "Unknown" ? (
        <section className="mb-4 rounded-2xl border border-border bg-surface p-4">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Blood group
          </h2>
          <p className="mt-1 text-3xl font-bold">{card.bloodGroup}</p>
        </section>
      ) : null}

      {card.allergies.length > 0 ? (
        <section className="mb-4 rounded-2xl border-2 border-danger bg-danger-subtle p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-danger">Allergies</h2>
          <ul className="mt-2 space-y-1.5">
            {card.allergies.map((allergy) => (
              <li key={allergy.substance}>
                <span className="font-semibold">{allergy.substance}</span>
                {allergy.reaction ? (
                  <span className="text-sm text-muted-foreground"> — {allergy.reaction}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {card.conditions.length > 0 ? (
        <section className="mb-4 rounded-2xl border border-border bg-surface p-4">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Active conditions
          </h2>
          <ul className="mt-2 space-y-1">
            {card.conditions.map((condition) => (
              <li key={condition.name} className="font-medium">
                {condition.name}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {card.medications.length > 0 ? (
        <section className="mb-4 rounded-2xl border border-border bg-surface p-4">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Current medicines
          </h2>
          <ul className="mt-2 space-y-1">
            {card.medications.map((medication) => (
              <li key={medication.drugName}>
                <span className="font-medium">{medication.drugName}</span>
                {medication.dose ? (
                  <span className="text-sm text-muted-foreground"> · {medication.dose}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {card.emergencyContactPhone ? (
        <a
          href={`tel:${card.emergencyContactPhone}`}
          className="mb-4 flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-4 text-base font-semibold text-primary-foreground"
        >
          <Phone aria-hidden className="size-5" />
          Call {card.emergencyContactName ?? "emergency contact"}
        </a>
      ) : null}

      <p className="text-center text-xs text-muted-foreground">
        Shared voluntarily via HealthLocker. This is not a complete medical record.
      </p>
    </main>
  );
}
