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
  "/offline",
  "/api/v1/health",
  "/api/v1/auth/refresh",
  // Background jobs carry no session — QStash signs its deliveries and Vercel
  // Cron presents CRON_SECRET, both checked by `authenticateJob`. Bouncing them
  // to /login would silently stop every reminder, because a cron cannot follow
  // a redirect to a form.
  "/api/jobs",
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/**
 * Content Security Policy, built per request around a fresh nonce.
 *
 * A nonce rather than `'unsafe-inline'`: Next injects its own inline bootstrap
 * script, and allowing inline script wholesale would make the policy almost
 * worthless against XSS — which is the one attack that reaches health data
 * through a logged-in browser. Next picks the nonce up from the request's own
 * CSP header and stamps it onto the scripts it emits.
 *
 * `'unsafe-eval'` is development-only; Turbopack's HMR needs it and production
 * does not.
 *
 * `style-src` still needs `'unsafe-inline'`: Tailwind ships a stylesheet, but
 * React writes inline `style` attributes that no nonce covers.
 */
function contentSecurityPolicy(nonce: string): string {
  const dev = process.env.NODE_ENV !== "production";

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    // data: covers the server-rendered QR codes; blob: covers generated PDFs.
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    // Same-origin only: there is no third-party analytics or tag manager, and
    // adding one to a health app would need its own decision.
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

/** Applied to every response the middleware returns, redirect or not. */
function withSecurityHeaders(response: NextResponse, nonce: string): NextResponse {
  response.headers.set("Content-Security-Policy", contentSecurityPolicy(nonce));
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Frame-Options", "DENY");
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce);

  // Forwarded on the REQUEST as well: this is how Next discovers the nonce and
  // applies it to its own inline scripts.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const proceed = () =>
    withSecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }), nonce);

  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  const claims = token ? await verifyToken(token, "access") : null;

  if (isPublic(pathname)) {
    // A signed-in user landing on /login goes to their portal instead.
    if (pathname === "/login" && claims && !claims.mustChangePassword) {
      return withSecurityHeaders(NextResponse.redirect(new URL("/", request.url)), nonce);
    }
    return proceed();
  }

  if (!claims) {
    const loginUrl = new URL("/login", request.url);
    // Preserve where they were headed so login can return them there.
    if (pathname !== "/") loginUrl.searchParams.set("next", `${pathname}${search}`);
    return withSecurityHeaders(NextResponse.redirect(loginUrl), nonce);
  }

  // An account that has never rotated its temporary password is pinned to the
  // change-password screen.
  if (claims.mustChangePassword && pathname !== "/change-password") {
    return withSecurityHeaders(
      NextResponse.redirect(new URL("/change-password", request.url)),
      nonce,
    );
  }

  return proceed();
}

export const config = {
  matcher: [
    // Everything except Next internals, static assets and the service worker.
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico)$).*)",
  ],
};
