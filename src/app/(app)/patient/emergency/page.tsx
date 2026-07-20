import { ShieldAlert } from "lucide-react";
import type { Metadata } from "next";

import { EmergencyClient } from "@/app/(app)/patient/emergency/emergency-client";
import { getPatientContext } from "@/modules/patient/context";
import { emergencyQrSvg, emergencyUrl, getActiveCard } from "@/modules/patient/emergency.service";
import { Alert } from "@/ui/alert";
import { PageHeader } from "@/ui/page-header";

export const metadata: Metadata = { title: "Emergency card" };
export const dynamic = "force-dynamic";

export default async function EmergencyPage() {
  const context = await getPatientContext();
  const card = await getActiveCard(context.patientId);

  // The QR is rendered server-side as inline SVG — the token never round-trips
  // through an image service.
  const qrSvg = card ? await emergencyQrSvg(card.shareToken) : null;

  return (
    <>
      <PageHeader
        title="Emergency card"
        description={
          context.isActingForOther
            ? `A card a first responder can scan for ${context.patientName}.`
            : "A card a first responder can scan if you cannot speak for yourself."
        }
      />

      <Alert tone="warning" className="mb-4">
        <p className="font-medium">Anyone with this link can read the card.</p>
        <p className="mt-0.5">
          That is the point — it has to work when you are unconscious. Share only what you are
          comfortable with a stranger seeing, and revoke it if a printed copy is lost.
        </p>
      </Alert>

      {context.accessLevel === "VIEW" ? (
        <Alert tone="info" className="mb-4">
          <ShieldAlert aria-hidden className="inline size-4" /> You have view-only access to this
          record, so you cannot issue or revoke a card.
        </Alert>
      ) : null}

      <EmergencyClient
        readOnly={context.accessLevel === "VIEW"}
        card={
          card
            ? {
                url: emergencyUrl(card.shareToken),
                qrSvg: qrSvg!,
                includeAllergies: card.includeAllergies,
                includeConditions: card.includeConditions,
                includeMedications: card.includeMedications,
                includeBloodGroup: card.includeBloodGroup,
                viewCount: card.viewCount,
                lastViewedAt: card.lastViewedAt?.toISOString() ?? null,
                createdAt: card.createdAt.toISOString(),
              }
            : null
        }
      />
    </>
  );
}
