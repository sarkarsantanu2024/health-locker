import { cookies } from "next/headers";

import { env, isProduction } from "@/lib/env";

/**
 * httpOnly cookie plumbing for the JWT session. Phase 2 builds login/refresh on
 * top of these; Phase 0 only establishes the contract.
 */

export const ACCESS_COOKIE = `${env.AUTH_COOKIE_PREFIX}_at`;
export const REFRESH_COOKIE = `${env.AUTH_COOKIE_PREFIX}_rt`;

const baseCookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax" as const,
  path: "/",
};

export async function setSessionCookies(accessToken: string, refreshToken: string): Promise<void> {
  const jar = await cookies();

  jar.set(ACCESS_COOKIE, accessToken, { ...baseCookieOptions, maxAge: env.AUTH_ACCESS_TOKEN_TTL });
  // Refresh token is only ever sent to the rotation endpoint.
  jar.set(REFRESH_COOKIE, refreshToken, {
    ...baseCookieOptions,
    maxAge: env.AUTH_REFRESH_TOKEN_TTL,
    path: "/api/v1/auth",
  });
}

export async function clearSessionCookies(): Promise<void> {
  const jar = await cookies();

  jar.set(ACCESS_COOKIE, "", { ...baseCookieOptions, maxAge: 0 });
  jar.set(REFRESH_COOKIE, "", { ...baseCookieOptions, maxAge: 0, path: "/api/v1/auth" });
}

export async function readAccessToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(ACCESS_COOKIE)?.value ?? null;
}

export async function readRefreshToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(REFRESH_COOKIE)?.value ?? null;
}
