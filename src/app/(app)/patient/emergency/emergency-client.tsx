"use client";

import { Copy, QrCode, RefreshCw, Trash2 } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";

import {
  issueEmergencyCardAction,
  revokeEmergencyCardAction,
  type PatientActionState,
} from "@/modules/patient/actions";
import { Alert } from "@/ui/alert";
import { Button } from "@/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { Label } from "@/ui/field";
import { EmptyState } from "@/ui/page-header";
import { toneFor } from "@/ui/tone";

const initial: PatientActionState = { ok: false };

/** The emergency card is an alert-coloured thing: rose, like allergies. */
const EMERGENCY_TONE = toneFor("alert");

export interface ActiveCard {
  url: string;
  qrSvg: string;
  includeAllergies: boolean;
  includeConditions: boolean;
  includeMedications: boolean;
  includeBloodGroup: boolean;
  viewCount: number;
  lastViewedAt: string | null;
  createdAt: string;
}

const SECTIONS = [
  { name: "includeBloodGroup", label: "Blood group" },
  { name: "includeAllergies", label: "Allergies" },
  { name: "includeConditions", label: "Active conditions" },
  { name: "includeMedications", label: "Current medicines" },
] as const;

function IssueButton({ hasCard }: { hasCard: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {hasCard ? <RefreshCw aria-hidden className="size-4" /> : <QrCode aria-hidden className="size-4" />}
      {pending ? "Issuing…" : hasCard ? "Issue a new card" : "Create emergency card"}
    </Button>
  );
}

export function EmergencyClient({ card, readOnly }: { card: ActiveCard | null; readOnly: boolean }) {
  const [issueState, issueAction] = useActionState(issueEmergencyCardAction, initial);
  const [revoking, startRevoke] = useTransition();
  const [revokeState, setRevokeState] = useState<PatientActionState | null>(null);
  const [copied, setCopied] = useState(false);

  const error = issueState.error ?? revokeState?.error;
  const message = issueState.message ?? revokeState?.message;

  return (
    <div className="space-y-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {message ? <Alert tone="success">{message}</Alert> : null}

      {card ? (
        <Card tone="consumer" hue={EMERGENCY_TONE}>
          <CardHeader>
            <CardTitle>Your active card</CardTitle>
            <CardDescription>
              Print this or save it to your phone&apos;s lock screen.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
              {/* Server-rendered SVG: no external image service ever sees the token. */}
              <div
                className="shrink-0 rounded-xl border border-border bg-white p-3 [&>svg]:size-40"
                aria-label="QR code linking to your emergency card"
                dangerouslySetInnerHTML={{ __html: card.qrSvg }}
              />

              <div className="min-w-0 flex-1 space-y-3">
                <div>
                  <Label>Link</Label>
                  <div className="mt-1 flex gap-2">
                    <code className="min-w-0 flex-1 wrap-break-word rounded-lg bg-muted px-3 py-2 font-mono text-xs">
                      {card.url}
                    </code>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        void navigator.clipboard.writeText(card.url);
                        setCopied(true);
                      }}
                    >
                      <Copy aria-hidden className="size-4" />
                      {copied ? "Copied" : "Copy"}
                    </Button>
                  </div>
                </div>

                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Times viewed</dt>
                    <dd className="font-medium">{card.viewCount}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Last viewed</dt>
                    <dd className="font-medium">
                      {card.lastViewedAt
                        ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(
                            new Date(card.lastViewedAt),
                          )
                        : "Never"}
                    </dd>
                  </div>
                </dl>

                <p className="text-xs text-muted-foreground">
                  Includes:{" "}
                  {SECTIONS.filter((s) => card[s.name]).map((s) => s.label.toLowerCase()).join(", ") ||
                    "nothing selected"}
                </p>
              </div>
            </div>

            {!readOnly ? (
              <form
                action={() =>
                  startRevoke(async () => setRevokeState(await revokeEmergencyCardAction()))
                }
              >
                <Button type="submit" variant="danger" size="sm" disabled={revoking}>
                  <Trash2 aria-hidden className="size-4" />
                  {revoking ? "Revoking…" : "Revoke this card"}
                </Button>
              </form>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {!card && readOnly ? (
        <EmptyState
          art="shield"
          tone={EMERGENCY_TONE}
          title="No emergency card yet"
          description="Only someone with manage access to this record can issue one."
        />
      ) : null}

      {!readOnly ? (
        <Card tone="consumer" hue={EMERGENCY_TONE}>
          <CardHeader>
            <CardTitle>{card ? "Issue a replacement" : "Create a card"}</CardTitle>
            <CardDescription>
              {card
                ? "Issuing a new card immediately stops the old link and any printed copies from working."
                : "Choose what a first responder should be able to see."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={issueAction} className="space-y-4">
              <fieldset className="space-y-3">
                <legend className="sr-only">Sections to include</legend>
                {SECTIONS.map((section) => (
                  <label key={section.name} className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      name={section.name}
                      defaultChecked={card ? card[section.name] : true}
                      className="size-5 rounded border-border-strong accent-primary"
                    />
                    <span className="text-sm">{section.label}</span>
                  </label>
                ))}
              </fieldset>

              <IssueButton hasCard={Boolean(card)} />
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
