import type { Metadata } from "next";
import Link from "next/link";

import { requirePermission } from "@/lib/auth/session";
import { auditActions, listAuditLog } from "@/modules/admin/admin.service";
import { buttonVariants } from "@/ui/button";
import { Badge } from "@/ui/badge";
import { Card, CardContent } from "@/ui/card";
import { Select } from "@/ui/field";
import { EmptyState, PageHeader } from "@/ui/page-header";

export const metadata: Metadata = { title: "Audit" };
export const dynamic = "force-dynamic";

/** Colour by what the action does, so destructive events stand out when scanning. */
function actionTone(action: string): "danger" | "warning" | "success" | "neutral" {
  if (/failed|rejected|suspended|blocked|revoked|deleted/.test(action)) return "danger";
  if (/reset|changed|updated|withdrawn/.test(action)) return "warning";
  if (/approved|created|activated|granted|login$/.test(action)) return "success";
  return "neutral";
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; page?: string }>;
}) {
  await requirePermission("audit:read");
  const params = await searchParams;

  const [result, actions] = await Promise.all([
    listAuditLog({ action: params.action, page: Number(params.page) || 1 }),
    auditActions(),
  ]);

  const pageHref = (page: number) => {
    const query = new URLSearchParams();
    if (params.action) query.set("action", params.action);
    query.set("page", String(page));
    return `/admin/audit?${query.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Audit trail"
        description={`${result.total} recorded events. Append-only — entries are never edited or deleted.`}
      />

      <form method="get" className="mb-4 flex flex-wrap gap-3">
        <Select
          name="action"
          defaultValue={params.action ?? ""}
          aria-label="Filter by action"
          className="max-w-xs"
        >
          <option value="">All actions</option>
          {actions.map((action) => (
            <option key={action} value={action}>
              {action}
            </option>
          ))}
        </Select>
        <button type="submit" className={buttonVariants()}>
          Filter
        </button>
        {params.action ? (
          <Link href="/admin/audit" className={buttonVariants({ variant: "ghost" })}>
            Clear
          </Link>
        ) : null}
      </form>

      {result.entries.length === 0 ? (
        <EmptyState title="No matching events" />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {result.entries.map((entry) => (
                <li key={entry.id} className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={actionTone(entry.action)} dot={false}>
                      {entry.action}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {entry.entityType}
                      {entry.entityId ? ` · ${entry.entityId.slice(0, 12)}…` : ""}
                    </span>
                  </div>

                  <p className="mt-1 text-sm">
                    <span className="font-medium">
                      {entry.actor ? entry.actor.displayName : "System"}
                    </span>
                    {entry.actor ? (
                      <span className="text-muted-foreground"> ({entry.actor.username})</span>
                    ) : null}
                    <span className="text-muted-foreground">
                      {" · "}
                      {new Intl.DateTimeFormat("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "medium",
                      }).format(entry.createdAt)}
                      {entry.org ? ` · ${entry.org.name}` : ""}
                      {entry.ip ? ` · ${entry.ip}` : ""}
                    </span>
                  </p>

                  {entry.metadata ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-muted-foreground">
                        Details
                      </summary>
                      {/* Credentials are redacted before they ever reach this table. */}
                      <pre className="mt-1 overflow-x-auto rounded-lg bg-muted p-2 text-xs">
                        {JSON.stringify(entry.metadata, null, 2)}
                      </pre>
                    </details>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {result.pages > 1 ? (
        <nav aria-label="Pagination" className="mt-4 flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Page {result.page} of {result.pages}
          </p>
          <div className="flex gap-2">
            {result.page > 1 ? (
              <Link href={pageHref(result.page - 1)} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                Previous
              </Link>
            ) : null}
            {result.page < result.pages ? (
              <Link href={pageHref(result.page + 1)} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                Next
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}
    </>
  );
}
