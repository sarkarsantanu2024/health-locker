import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The current session, for client components that need it. Returns the same
 * shape whether or not the caller is signed in, so the client has one branch.
 *
 * Deliberately omits the permission list's provenance and anything not needed
 * for rendering — this response is visible to the browser.
 */
export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ authenticated: false, user: null });
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      id: session.id,
      username: session.username,
      displayName: session.displayName,
      role: session.role,
      orgId: session.orgId,
      mustChangePassword: session.mustChangePassword,
      twoFactorEnabled: session.twoFactorEnabled,
      permissions: session.permissions,
    },
  });
}
