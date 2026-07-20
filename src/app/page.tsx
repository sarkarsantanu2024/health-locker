import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { PORTAL_BY_ROLE } from "@/shared/enums";

export const dynamic = "force-dynamic";

/**
 * There is no public landing page: this product has no self-signup and nothing
 * to market to an anonymous visitor. Signed-in users go to their portal,
 * everyone else to the login screen.
 *
 * Machine-readable status stayed public at /api/v1/health.
 */
export default async function RootPage() {
  const session = await getSession();

  if (!session) redirect("/login");
  if (session.mustChangePassword) redirect("/change-password");

  redirect(PORTAL_BY_ROLE[session.role]);
}
