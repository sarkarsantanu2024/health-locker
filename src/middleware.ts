import { NextResponse, type NextRequest } from "next/server";

import { verifyToken } from "@/lib/auth/jwt";
import { env } from "@/lib/env";

/**
 * Edge-level gate. This is a fast redirect for unauthenticated traffic, NOT the
 * authorization boundary — it verifies the JWT signature but cannot check the
 * database, so it cannot know about a suspended user or a revoked session.
 *
 * The real enforcement is `requireUser()` / `requirePermission()` in every
 * server action and route handler (src/lib/auth/session.ts), which re-reads the
 * user on each request. Never rely on this file alone to protect a page.
 */

const ACCESS_COOKIE = `${env.AUTH_COOKIE_PREFIX}_at`;

/**
 * Reachable without a session.
 *
 * `/signup` creates a PENDING_ACTIVATION account that still cannot sign in until
 * an admin verifies payment — see modules/identity/signup.service.ts.
 *
 * `/pay` MUST be public: a self-registered consumer pays BEFORE their account is
 * activated, so requiring a session here would deadlock onboarding entirely.
 * The reference code is the only credential and it grants nothing but sight of
 * the amount plus the ability to file a transaction reference; the action behind
 * it is rate-limited per reference code.
 *
 * `/emergency` is public by design — it has to work when the patient cannot.
 */
const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/pay",
  "/emergency",
  "/api/v1/health",
  "/api/v1/auth/refresh",
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  const claims = token ? await verifyToken(token, "access") : null;

  if (isPublic(pathname)) {
    // A signed-in user landing on /login goes to their portal instead.
    if (pathname === "/login" && claims && !claims.mustChangePassword) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (!claims) {
    const loginUrl = new URL("/login", request.url);
    // Preserve where they were headed so login can return them there.
    if (pathname !== "/") loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  // An account that has never rotated its temporary password is pinned to the
  // change-password screen.
  if (claims.mustChangePassword && pathname !== "/change-password") {
    return NextResponse.redirect(new URL("/change-password", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Everything except Next internals, static assets and the service worker.
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico)$).*)",
  ],
};
