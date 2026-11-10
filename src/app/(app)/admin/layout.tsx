import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { getSession, isPlatformRole } from "@/lib/auth/session";
import { PORTAL_BY_ROLE } from "@/shared/enums";

export const dynamic = "force-dynamic";

/**
 * The platform console is for platform roles only.
 *
 * Every page under `/admin` also guards itself with `requirePlatformPermission`,
 * but a layout-level check means a page added later without a guard is still
 * not reachable by a patient or a provider admin who types the URL. Anyone else
 * is sent to their own portal rather than shown an error: `/admin` is not a
 * secret, so there is nothing to hide, only nothing for them to do here.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getSession();

  // The parent (app) layout has already bounced the signed-out and the
  // must-change-password cases; this is belt and braces.
  if (!session) redirect("/login");
  if (!isPlatformRole(session.role)) redirect(PORTAL_BY_ROLE[session.role]);

  return <>{children}</>;
}
