import {
  Activity,
  ArrowRight,
  BedDouble,
  Bell,
  CheckCircle2,
  FlaskConical,
  KeyRound,
  Lock,
  Pill,
  QrCode,
  ScrollText,
  ShieldCheck,
  Smartphone,
  Stethoscope,
  Users,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { PORTAL_BY_ROLE } from "@/shared/enums";
import { buttonVariants } from "@/ui/button";

export const metadata: Metadata = {
  title: "HealthLocker — your family's health records, in one place",
  description:
    "Prescriptions, lab reports, medicines, vaccinations and bills for your whole family. Shared with your doctor only when you say so.",
  robots: { index: true, follow: true },
};

export const dynamic = "force-dynamic";

const PATIENT_FEATURES = [
  {
    icon: Activity,
    title: "One timeline, not ten folders",
    body: "Every prescription, report, visit, vaccination and bill in one list, newest first — for you and for everyone you look after.",
  },
  {
    icon: Pill,
    title: "Medicine reminders that know the dose",
    body: "When your doctor writes 1-0-1 for five days, the reminders set themselves. Tick them off as you take them.",
  },
  {
    icon: FlaskConical,
    title: "Results in plain language",
    body: "Lab values outside the usual range are flagged clearly — and never interpreted for you, because that is your doctor's job.",
  },
  {
    icon: Users,
    title: "Your whole family",
    body: "Switch between your own record, your child's and your parents'. Give a sibling view-only access without handing over your password.",
  },
  {
    icon: QrCode,
    title: "An emergency card that works when you cannot",
    body: "A QR code a first responder can scan for your blood group, allergies and current medicines. Nothing else.",
  },
  {
    icon: Bell,
    title: "Nothing lost, nothing spammed",
    body: "Reminders arrive as notifications with quiet hours you set. Turning one off never deletes the notice.",
  },
];

const PROVIDER_FEATURES = [
  {
    icon: Stethoscope,
    title: "Clinic",
    body: "Day list, check-in, consultation notes, and a prescription that prints on your letterhead — and lands in the patient's phone.",
  },
  {
    icon: BedDouble,
    title: "Hospital",
    body: "Departments, admissions, bed occupancy, operation notes and a discharge summary the patient can actually read.",
  },
  {
    icon: FlaskConical,
    title: "Diagnostic centre",
    body: "Catalogue, bookings, sample tracking, and results that stay invisible to the patient until someone signs them off.",
  },
  {
    icon: ScrollText,
    title: "Pharmacy",
    body: "Stock by batch with expiry alerts, prescription verification before dispensing, and orders from placed to delivered.",
  },
];

const STEPS = [
  {
    step: "1",
    title: "Create your account",
    body: "Pick your own username and password. Name, mobile and address — no email needed, because we never send one.",
  },
  {
    step: "2",
    title: "Pay however you like",
    body: "UPI, QR or a bank transfer. Tell us the reference; a person checks it against the statement and switches your account on.",
  },
  {
    step: "3",
    title: "Start filling your locker",
    body: "Add what you have, and let your clinic, lab and pharmacy add the rest as you use them.",
  },
];

export default async function LandingPage() {
  // A signed-in visitor has no use for the sales pitch.
  const session = await getSession();

  if (session) {
    redirect(session.mustChangePassword ? "/change-password" : PORTAL_BY_ROLE[session.role]);
  }

  return (
    <>
      {/* --- hero ----------------------------------------------------------- */}
      <section className="bg-hero-wash">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div className="max-w-xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
                <span aria-hidden className="size-1.5 rounded-full bg-primary" />
                Built in India, for Indian families
              </span>

              <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-display">
                Your family&apos;s health records,{" "}
                <span className="text-brand-gradient">in one place</span>
              </h1>

              <p className="mt-5 text-lg text-muted-foreground">
                Prescriptions, lab reports, medicines, vaccinations and bills — for you, your
                children and your parents. Shared with a doctor only when you say so.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/signup" className={buttonVariants({ size: "lg" })}>
                  Get started
                  <ArrowRight aria-hidden className="size-4" />
                </Link>
                <Link
                  href="/login"
                  className={buttonVariants({ variant: "secondary", size: "lg" })}
                >
                  I already have an account
                </Link>
              </div>

              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
                {["No ads, ever", "Encrypted at rest", "Export everything, any time"].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <CheckCircle2 aria-hidden className="size-4 text-success" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* A drawn impression of the app rather than a screenshot, so it
                cannot go stale as the product changes. */}
            <div className="relative mx-auto w-full max-w-sm lg:mx-0">
              <div className="rounded-[2rem] border border-border bg-surface p-3 shadow-xl">
                <div className="rounded-[1.5rem] bg-background p-5">
                  <p className="text-xs text-muted-foreground">Good morning,</p>
                  <p className="text-xl font-semibold tracking-tight">Priya</p>

                  <div className="mt-4 rounded-consumer border border-primary/30 bg-primary-subtle/50 p-4">
                    <p className="text-sm font-medium">2 doses due today</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Thyronorm at 7:00 am · Metformin at 8:00 pm
                    </p>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3">
                    {[
                      { icon: Pill, label: "Medicines", tone: "bg-primary-subtle text-primary" },
                      { icon: FlaskConical, label: "Reports", tone: "bg-info-subtle text-info" },
                      { icon: Activity, label: "Timeline", tone: "bg-success-subtle text-success" },
                      { icon: Users, label: "Family", tone: "bg-accent-subtle text-accent" },
                    ].map((tile) => (
                      <div
                        key={tile.label}
                        className="rounded-consumer border border-border bg-surface p-3 shadow-sm"
                      >
                        <span
                          className={`flex size-9 items-center justify-center rounded-xl ${tile.tone}`}
                        >
                          <tile.icon aria-hidden className="size-4.5" />
                        </span>
                        <p className="mt-2 text-sm font-medium">{tile.label}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 rounded-consumer border border-border bg-surface p-3 shadow-sm">
                    <p className="text-sm font-medium">Lipid profile is ready</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      2 values outside the usual range
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --- patient features ---------------------------------------------- */}
      <section id="features" className="scroll-mt-20 border-t border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-primary">For you and your family</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              Everything a paper file does, minus the paper
            </h2>
            <p className="mt-4 text-muted-foreground">
              Most health records in India live in a plastic bag on top of a cupboard. This is that
              bag, searchable, and with you when you need it.
            </p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {PATIENT_FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="rounded-consumer border border-border bg-background p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <span className="flex size-11 items-center justify-center rounded-2xl bg-primary-subtle text-primary">
                  <feature.icon aria-hidden className="size-5" />
                </span>
                <h3 className="mt-4 font-medium">{feature.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{feature.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --- how it works --------------------------------------------------- */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Three steps, and one of them is a person checking your payment
          </h2>

          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            {STEPS.map((step) => (
              <div key={step.step}>
                <span className="flex size-10 items-center justify-center rounded-full bg-brand-gradient text-sm font-semibold text-white">
                  {step.step}
                </span>
                <h3 className="mt-4 font-medium">{step.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --- providers ------------------------------------------------------ */}
      <section id="providers" className="scroll-mt-20 border-t border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-primary">For clinics, hospitals, labs and pharmacies</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              The other half of the record
            </h2>
            <p className="mt-4 text-muted-foreground">
              A patient&apos;s locker fills itself when the people treating them are on the same
              system. Each portal is scoped to your organisation — you see your patients, nobody
              else&apos;s.
            </p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2">
            {PROVIDER_FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="flex gap-4 rounded-console border border-border bg-background p-6 shadow-sm"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-subtle text-primary">
                  <feature.icon aria-hidden className="size-5" />
                </span>
                <div>
                  <h3 className="font-medium">{feature.title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{feature.body}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-8 text-sm text-muted-foreground">
            Provider accounts are set up by us rather than self-registered, so nobody can claim a
            clinic that is not theirs.{" "}
            <Link href="/signup" className="font-medium text-primary underline underline-offset-4">
              Ask for an account
            </Link>
            .
          </p>
        </div>
      </section>

      {/* --- security ------------------------------------------------------- */}
      <section id="security" className="scroll-mt-20 border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="grid gap-12 lg:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-primary">Security and your rights</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                It is your data. We behave like it.
              </h2>
              <p className="mt-4 text-muted-foreground">
                Health records are the most sensitive data most people ever generate. HealthLocker
                follows India&apos;s DPDP Act, GDPR principles and HIPAA-inspired safeguards.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/signup" className={buttonVariants({ size: "lg" })}>
                  Get started
                  <ArrowRight aria-hidden className="size-4" />
                </Link>
              </div>
            </div>

            <ul className="space-y-5">
              {[
                {
                  icon: Lock,
                  title: "Encrypted where it matters",
                  body: "Identifiers like your ABHA number, policy numbers and bank details are encrypted in the database, not just in transit.",
                },
                {
                  icon: ShieldCheck,
                  title: "Every read is logged",
                  body: "When a clinic opens your record it is written to an append-only audit trail, with who and when.",
                },
                {
                  icon: KeyRound,
                  title: "Nobody can become you",
                  body: "An admin can reset your password to a temporary one — never set it. There is no way for staff to sign in as you.",
                },
                {
                  icon: Smartphone,
                  title: "Take it or delete it",
                  body: "Download everything as a file whenever you like, withdraw a consent, or ask us to delete what the law allows.",
                },
              ].map((item) => (
                <li key={item.title} className="flex gap-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-success-subtle text-success">
                    <item.icon aria-hidden className="size-5" />
                  </span>
                  <div>
                    <h3 className="font-medium">{item.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* --- closing CTA ---------------------------------------------------- */}
      <section className="border-t border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="overflow-hidden rounded-consumer bg-brand-gradient px-8 py-14 text-center shadow-lg sm:px-16">
            <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Stop hunting for last year&apos;s blood test
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-white/90">
              Set up your locker today, and add your family in a couple of minutes.
            </p>
            <Link
              href="/signup"
              className="mt-8 inline-flex h-12 items-center gap-2 rounded-xl bg-white px-6 text-base font-medium text-primary shadow-md transition-transform hover:scale-[1.02]"
            >
              Get started
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
