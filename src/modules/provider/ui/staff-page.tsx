import { UserRow } from "@/app/(app)/admin/users/user-row";
import { requireTenantPermission } from "@/lib/auth/session";
import { listUsers } from "@/modules/admin/admin.service";
import { CreateStaffForm } from "@/modules/provider/ui/staff-client";
import { ORG_TYPE_BY_ROLE, ROLES, type Role } from "@/shared/enums";
import { Card, CardContent } from "@/ui/card";
import { EmptyState, PageHeader } from "@/ui/page-header";

/**
 * Staff management inside a provider console.
 *
 * The list is filtered by the caller's own `orgId`, which comes from the session
 * guard — and every mutation behind it (create, reset, suspend) re-derives that
 * same scope server-side, so this screen is a convenience rather than the
 * boundary.
 */
export async function ProviderStaffPage() {
  const { user, orgId } = await requireTenantPermission("user:read");

  const result = await listUsers({ orgId }, user.id);

  // The staff and admin roles for this tenant type, and nothing else: a clinic
  // admin has no business minting a platform account.
  const orgType = ORG_TYPE_BY_ROLE[user.role];
  const assignableRoles = (ROLES as readonly Role[]).filter(
    (role) => ORG_TYPE_BY_ROLE[role] === orgType && orgType !== "PLATFORM",
  );

  return (
    <>
      <PageHeader
        title="Staff"
        description={`${result.total} account${result.total === 1 ? "" : "s"} in this organisation. Passwords can only ever be reset to a temporary one — never read, never chosen.`}
        action={<CreateStaffForm roles={assignableRoles} />}
      />

      {result.users.length === 0 ? (
        <EmptyState
          title="No staff accounts yet"
          description="Create one for each person who signs in. Sharing a login makes the audit trail useless."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul>
              {result.users.map((staff) => (
                <UserRow
                  key={staff.id}
                  user={{
                    id: staff.id,
                    username: staff.username,
                    displayName: staff.displayName,
                    phone: staff.phone,
                    role: staff.role,
                    status: staff.status,
                    mustChangePassword: staff.mustChangePassword,
                    twoFactorEnabled: staff.twoFactorEnabled,
                    lastLoginAt: staff.lastLoginAt?.toISOString() ?? null,
                    lockedUntil: staff.lockedUntil?.toISOString() ?? null,
                    orgName: staff.org?.name ?? null,
                  }}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  );
}
