import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/lib/auth/session";
import { getPatientContext } from "@/modules/patient/context";
import { listConsents } from "@/modules/patient/patient.service";
import { listSessions } from "@/modules/patient/privacy.service";
import { CONSENT_LABELS, CONSENT_TYPES } from "@/shared/enums";
import { Alert } from "@/ui/alert";
import { buttonVariants } from "@/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { PageHeader } from "@/ui/page-header";

import { ConsentList, ErasureRequest, SessionList } from "./privacy-client";

export const metadata: Metadata = { title: "Privacy and data" };
export const dynamic = "force-dynamic";

/**
 * The DPDP rights screen: what you have agreed to, what we hold, which devices
 * are signed in, and how to get it all back or ask for it to go.
 *
 * Everything here is about the caller's OWN record — a family link lets you look
 * after someone's care, not exercise their data rights.
 */
export default async function PrivacyPage() {
  const user = await requireUser();

  // Staff and admins reach this page too — they have sessions to manage but no
  // patient record, so the data-rights half is simply absent rather than an
  // error page.
  const context = await getPatientContext().catch(() => null);

  const [consents, sessions] = await Promise.all([
    context ? listConsents(context.ownPatientId) : Promise.resolve([]),
    listSessions(user.id, user.sessionId),
  ]);

  // The latest record per type decides the current state; the history stays in
  // the table so "was there consent at the time?" is still answerable.
  const current = new Map<string, boolean>();
  for (const record of [...consents].reverse()) {
    current.set(record.type, record.granted && record.revokedAt === null);
  }

  return (
    <>
      <PageHeader
        title="Privacy and data"
        description="What you have agreed to, and everything we hold about you."
        action={
          <Link href="/account" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Back to account
          </Link>
        }
      />

      <div className="space-y-6">
        {context ? (
        <Card tone="consumer">
          <CardHeader>
            <CardTitle>Your consents</CardTitle>
            <CardDescription>
              Withdrawing a consent stops future use. It does not erase what was already recorded
              while it was in force — that history is what makes the trail auditable.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ConsentList
              consents={CONSENT_TYPES.map((type) => ({
                type,
                label: CONSENT_LABELS[type].label,
                description: CONSENT_LABELS[type].description,
                required: CONSENT_LABELS[type].required,
                granted: current.get(type) ?? false,
              }))}
            />
          </CardContent>
        </Card>
        ) : null}

        {context ? (
        <Card tone="consumer">
          <CardHeader>
            <CardTitle>Get a copy of your data</CardTitle>
            <CardDescription>
              Everything we hold, as a JSON file you can keep or take elsewhere.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <a
              href="/api/v1/patient/data-export"
              className={buttonVariants({ variant: "secondary" })}
              download
            >
              <Download aria-hidden className="size-4" />
              Download everything (JSON)
            </a>
            {/* Route handlers, not pages: these stream a file, so a client-side
                Link navigation would be wrong even where the lint rule expects one. */}
            <Link
              href="/api/v1/patient/export"
              prefetch={false}
              className={buttonVariants({ variant: "ghost" })}
            >
              <Download aria-hidden className="size-4" />
              Health summary (PDF)
            </Link>
          </CardContent>
        </Card>
        ) : null}

        <Card tone="consumer">
          <CardHeader>
            <CardTitle>Devices signed in</CardTitle>
            <CardDescription>
              Sign out anything you do not recognise. Changing your password signs out everything.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SessionList sessions={sessions} />
          </CardContent>
        </Card>

        {context ? (
        <Card tone="consumer">
          <CardHeader>
            <CardTitle>Delete my data</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Alert tone="info">
              HealthLocker holds health data, so some of it is subject to retention rules that
              outlast an account. We will delete everything we can and tell you what we cannot.
            </Alert>
            <ErasureRequest />
          </CardContent>
        </Card>
        ) : null}
      </div>
    </>
  );
}
