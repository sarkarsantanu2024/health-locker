import { Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { UserRow } from "@/app/(app)/admin/users/user-row";
import { requirePermission } from "@/lib/auth/session";
import { listUsers } from "@/modules/admin/admin.service";
import { ROLES, USER_STATUSES } from "@/shared/enums";
import { buttonVariants } from "@/ui/button";
import { Card, CardContent } from "@/ui/card";
import { Input, Select } from "@/ui/field";
import { EmptyState, PageHeader } from "@/ui/page-header";

export const metadata: Metadata = { title: "Users" };
export const dynamic = "force-dynamic";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; status?: string; page?: string }>;
}) {
  const actor = await requirePermission("user:read");
  const params = await searchParams;

  const result = await listUsers(
    {
      query: params.q,
      role: (ROLES as readonly string[]).includes(params.role ?? "")
        ? (params.role as (typeof ROLES)[number])
        : undefined,
      status: (USER_STATUSES as readonly string[]).includes(params.status ?? "")
        ? (params.status as (typeof USER_STATUSES)[number])
        : undefined,
      page: Number(params.page) || 1,
    },
    actor.id,
  );

  const buildPageHref = (page: number) => {
    const query = new URLSearchParams();
    if (params.q) query.set("q", params.q);
    if (params.role) query.set("role", params.role);
    if (params.status) query.set("status", params.status);
    query.set("page", String(page));
    return `/admin/users?${query.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Users"
        description={`${result.total} account${result.total === 1 ? "" : "s"}. Passwords are only ever reset to a temporary one — they cannot be read.`}
      />

      <form method="get" className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Name, username or phone"
            aria-label="Search users"
            className="pl-9"
          />
        </div>

        <Select name="role" defaultValue={params.role ?? ""} aria-label="Filter by role">
          <option value="">All roles</option>
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {role.replace(/_/g, " ").toLowerCase()}
            </option>
          ))}
        </Select>

        <Select name="status" defaultValue={params.status ?? ""} aria-label="Filter by status">
          <option value="">All statuses</option>
          {USER_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status.replace(/_/g, " ").toLowerCase()}
            </option>
          ))}
        </Select>

        <button type="submit" className={buttonVariants()}>
          Search
        </button>
      </form>

      {result.users.length === 0 ? (
        <EmptyState
          title="No users match"
          description="Try a different search, or clear the filters."
          action={
            <Link href="/admin/users" className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Clear filters
            </Link>
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul>
              {result.users.map((user) => (
                <UserRow
                  key={user.id}
                  user={{
                    id: user.id,
                    username: user.username,
                    displayName: user.displayName,
                    phone: user.phone,
                    role: user.role,
                    status: user.status,
                    mustChangePassword: user.mustChangePassword,
                    twoFactorEnabled: user.twoFactorEnabled,
                    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
                    lockedUntil: user.lockedUntil?.toISOString() ?? null,
                    orgName: user.org?.name ?? null,
                  }}
                />
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
              <Link href={buildPageHref(result.page - 1)} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                Previous
              </Link>
            ) : null}
            {result.page < result.pages ? (
              <Link href={buildPageHref(result.page + 1)} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                Next
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}
    </>
  );
}
