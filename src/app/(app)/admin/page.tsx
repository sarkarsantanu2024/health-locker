import {
  Banknote,
  Building2,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { revenueSummary } from "@/modules/admin/admin.service";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { PageHeader } from "@/ui/page-header";
import { Stat, StatHero } from "@/ui/stat";
import { TONE_STYLES, toneFor, type Tone } from "@/ui/tone";

export const metadata: Metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

function money(minor: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(minor / 100);
}

export default async function AdminHomePage() {
  const user = await requireUser();

  const [revenue, users, pendingUsers, orgs, pendingRequests] = await Promise.all([
    revenueSummary(),
    prisma.user.count({ where: { deletedAt: null, status: "ACTIVE" } }),
    prisma.user.count({ where: { deletedAt: null, status: "PENDING_ACTIVATION" } }),
    prisma.organization.count({ where: { deletedAt: null, type: { not: "PLATFORM" } } }),
    prisma.accessRequest.count({
      where: { deletedAt: null, status: { in: ["PENDING", "AWAITING_PAYMENT"] } },
    }),
  ]);

  /* Each queue keeps the hue of the section it leads to, so the tile and the
     sidebar item you are about to click agree. */
  const queues: {
    href: string;
    label: string;
    value: number;
    icon: typeof Banknote;
    description: string;
    tone: Tone;
  }[] = [
    {
      href: "/admin/payments",
      label: "Payments to verify",
      value: revenue.pendingVerification,
      icon: Banknote,
      description: "Check the screenshot and UTR, then approve.",
      tone: toneFor("billing"),
    },
    {
      href: "/admin/onboarding",
      label: "Onboarding waiting",
      value: pendingRequests,
      icon: ClipboardList,
      description: "Sign-ups and enquiries needing action.",
      tone: toneFor("patient"),
    },
    {
      href: "/admin/users",
      label: "Awaiting activation",
      value: pendingUsers,
      icon: Users,
      description: "Signed up, payment not yet confirmed.",
      tone: toneFor("staff"),
    },
  ];

  return (
    <>
      <PageHeader
        title="Platform administration"
        icon={LayoutDashboard}
        tone="teal"
        description={`Signed in as ${user.username}`}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatHero
          label="Collected this month"
          value={money(revenue.monthMinor)}
          icon={CreditCard}
          hint={`${revenue.monthCount} approved payment${revenue.monthCount === 1 ? "" : "s"}`}
          tone={toneFor("billing")}
        />
        <Stat
          label="Collected this year"
          value={money(revenue.yearMinor)}
          icon={Banknote}
          tone="emerald"
        />
        <Stat
          label="Active subscriptions"
          value={revenue.activeSubscriptions}
          icon={ShieldCheck}
          tone={toneFor("patient")}
        />
        <Stat
          label="Tenants"
          value={orgs}
          icon={Building2}
          hint={`${users} active users`}
          tone={toneFor("department")}
        />
      </div>

      <h2 className="mb-3 text-sm font-medium text-muted-foreground">Needs your attention</h2>

      <div className="grid gap-3 md:grid-cols-3">
        {queues.map((queue) => {
          const Icon = queue.icon;
          const waiting = queue.value > 0;
          /* An empty queue is not a queue: it goes grey so the ones with work in
             them are the only coloured things in the row. */
          const style = TONE_STYLES[waiting ? queue.tone : "neutral"];

          return (
            <Link key={queue.href} href={queue.href} className="block">
              <Card interactive className="h-full" hue={waiting ? queue.tone : undefined}>
                <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                  <div>
                    <CardTitle className="text-sm">{queue.label}</CardTitle>
                    <CardDescription className="mt-1">{queue.description}</CardDescription>
                  </div>
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-lg",
                      style.chipSolid,
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                </CardHeader>
                <CardContent>
                  <p className={cn("text-3xl font-semibold", waiting && style.text)}>
                    {queue.value}
                  </p>
                  {/* The word, not just the colour, says whether anything is waiting. */}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {waiting ? "Waiting for you" : "Nothing waiting"}
                  </p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        Revenue counts approved payments only — a submitted claim is not money until you have
        matched it against your bank statement.
      </p>
    </>
  );
}
