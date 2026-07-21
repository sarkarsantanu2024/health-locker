import { ArrowRight, Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { prisma } from "@/lib/db";
import { humanizeEnum, money } from "@/lib/format";
import { buttonVariants } from "@/ui/button";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Simple plans for families and for clinics, hospitals, diagnostic centres and pharmacies. Pay by UPI, QR or bank transfer.",
  robots: { index: true, follow: true },
};

export const dynamic = "force-dynamic";

/** Turns the Plan.features JSON into readable lines. */
function describeFeatures(features: unknown): string[] {
  if (!features || typeof features !== "object") return [];

  const lines: string[] = [];

  for (const [key, value] of Object.entries(features as Record<string, unknown>)) {
    if (value === false || value === null || value === undefined) continue;

    const label = key
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (c) => c.toUpperCase())
      .trim();

    if (value === true) lines.push(label);
    else if (Array.isArray(value)) lines.push(`${label}: ${value.join(", ")}`);
    else lines.push(`${label}: ${String(value)}`);
  }

  return lines;
}

/**
 * Prices come from the database, not from this file.
 *
 * A hard-coded price list is the classic way to end up charging one number and
 * advertising another — the plans here are the same rows the signup flow and the
 * payment request read.
 */
export default async function PricingPage() {
  const plans = await prisma.plan.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: [{ audience: "asc" }, { sortOrder: "asc" }],
    select: {
      id: true,
      name: true,
      description: true,
      audience: true,
      priceMinor: true,
      interval: true,
      features: true,
    },
  });

  const patientPlans = plans.filter((plan) => plan.audience === "PATIENT");
  const providerPlans = plans.filter((plan) => plan.audience === "PROVIDER");

  const groups = [
    {
      key: "patient",
      title: "For families",
      blurb: "One locker for you, your children and your parents.",
      plans: patientPlans,
      cta: { href: "/signup", label: "Get started" },
    },
    {
      key: "provider",
      title: "For providers",
      blurb:
        "Clinics, hospitals, diagnostic centres and pharmacies. Accounts are set up by us, so nobody can claim a practice that is not theirs.",
      plans: providerPlans,
      cta: { href: "/signup", label: "Request an account" },
    },
  ].filter((group) => group.plans.length > 0);

  return (
    <>
      <section className="bg-hero-wash">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="max-w-2xl">
            <h1 className="text-4xl font-semibold tracking-tight sm:text-display">
              Simple pricing, <span className="text-brand-gradient">paid your way</span>
            </h1>
            <p className="mt-5 text-lg text-muted-foreground">
              UPI, QR or bank transfer — no card required, and no payment gateway sitting between
              you and us. A person checks every payment, usually within a few hours.
            </p>
          </div>
        </div>
      </section>

      {groups.map((group) => (
        <section key={group.key} className="border-t border-border first:border-t-0 even:bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{group.title}</h2>
              <p className="mt-2 text-muted-foreground">{group.blurb}</p>
            </div>

            <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {group.plans.map((plan, index) => {
                // The second paid plan is the one most people should pick, so it
                // is the one that carries the emphasis.
                const featured = group.plans.length > 1 && index === 1;
                const lines = describeFeatures(plan.features);

                return (
                  <div
                    key={plan.id}
                    className={
                      "relative flex flex-col rounded-consumer border bg-background p-6 shadow-sm " +
                      (featured ? "border-primary/40 ring-1 ring-primary/20" : "border-border")
                    }
                  >
                    {featured ? (
                      <span className="absolute -top-3 left-6 rounded-full bg-brand-gradient px-3 py-1 text-xs font-medium text-white shadow-sm">
                        Most popular
                      </span>
                    ) : null}

                    <h3 className="font-medium">{plan.name}</h3>

                    <p className="mt-3 flex items-baseline gap-1.5">
                      <span className="text-3xl font-semibold tracking-tight">
                        {plan.priceMinor === 0 ? "Free" : money(plan.priceMinor)}
                      </span>
                      {plan.priceMinor > 0 ? (
                        <span className="text-sm text-muted-foreground">
                          / {humanizeEnum(plan.interval).toLowerCase()}
                        </span>
                      ) : null}
                    </p>

                    {plan.description ? (
                      <p className="mt-3 text-sm text-muted-foreground">{plan.description}</p>
                    ) : null}

                    {lines.length > 0 ? (
                      <ul className="mt-5 space-y-2 text-sm">
                        {lines.map((line) => (
                          <li key={line} className="flex gap-2">
                            <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
                            <span className="text-muted-foreground">{line}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    <div className="mt-auto pt-6">
                      <Link
                        href={group.cta.href}
                        className={buttonVariants({
                          variant: featured ? "primary" : "secondary",
                          full: true,
                        })}
                      >
                        {group.cta.label}
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      ))}

      <section className="border-t border-border">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight">Questions people actually ask</h2>

          <dl className="mt-8 space-y-6">
            {[
              {
                q: "How do I pay without a card?",
                a: "You get a reference code and a QR. Pay by any UPI app or a normal bank transfer, then tell us the transaction reference. Someone checks it against the statement and switches your account on.",
              },
              {
                q: "What happens to my records if I stop paying?",
                a: "They stay yours. You can always download everything as a file from your account, whatever the state of your subscription.",
              },
              {
                q: "Can my doctor see everything automatically?",
                a: "No. A provider sees your record because you are registered with them, and that link is recorded as a consent you can withdraw.",
              },
              {
                q: "Do you sell data or show ads?",
                a: "No, and no. There is no advertising anywhere in the product — serving an ad next to a diagnosis leaks the diagnosis.",
              },
            ].map((item) => (
              <div key={item.q}>
                <dt className="font-medium">{item.q}</dt>
                <dd className="mt-1.5 text-sm text-muted-foreground">{item.a}</dd>
              </div>
            ))}
          </dl>

          <Link href="/signup" className={buttonVariants({ size: "lg", className: "mt-10" })}>
            Get started
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
      </section>
    </>
  );
}
