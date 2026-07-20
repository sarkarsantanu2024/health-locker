import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import { NAV_BY_ROLE } from "@/modules/identity/navigation";
import { buttonVariants } from "@/ui/button";
import { Card, CardContent } from "@/ui/card";
import { PageHeader } from "@/ui/page-header";
import { CONSUMER_ROLES, PORTAL_BY_ROLE } from "@/shared/enums";

export const dynamic = "force-dynamic";

/**
 * Catch-all for portal sections a later phase builds.
 *
 * The navigation deliberately shows the product's full shape, so every link has
 * to lead somewhere. A destination listed in NAV_BY_ROLE with a `phase` renders
 * an honest in-progress page; anything else is a genuine 404, so a typo is still
 * reported as a typo.
 */

async function resolve(segments: string[]) {
  const user = await requireUser();
  const href = `/${segments.join("/")}`;
  const item = NAV_BY_ROLE[user.role].find((entry) => entry.href === href);

  // Only a planned destination this role can actually reach gets a placeholder.
  if (!item?.phase) return null;
  if (item.permission && !user.permissions.includes(item.permission)) return null;

  return { user, item };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ segments: string[] }>;
}): Promise<Metadata> {
  const resolved = await resolve((await params).segments);
  return { title: resolved?.item.label ?? "Not found" };
}

export default async function PlannedSectionPage({
  params,
}: {
  params: Promise<{ segments: string[] }>;
}) {
  const resolved = await resolve((await params).segments);

  if (!resolved) notFound();

  const { user, item } = resolved;
  const Icon = item.icon;
  const home = PORTAL_BY_ROLE[user.role];
  const consumer = CONSUMER_ROLES.includes(user.role);

  return (
    <>
      <PageHeader title={item.label} description={item.summary} />

      <Card tone={consumer ? "consumer" : "console"}>
        <CardContent className="flex flex-col items-center gap-4 px-6 py-14 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-subtle text-primary">
            <Icon aria-hidden className="size-6" />
          </span>

          <div className="max-w-md space-y-1">
            <p className="font-medium">This section is being built</p>
            <p className="text-sm text-muted-foreground">
              {item.summary} It arrives in Phase {item.phase}.
            </p>
          </div>

          <Link href={home} className={buttonVariants({ variant: "secondary", size: "sm" })}>
            <ArrowLeft aria-hidden className="size-4" />
            Back to dashboard
          </Link>
        </CardContent>
      </Card>
    </>
  );
}
