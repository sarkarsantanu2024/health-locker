import { SignJWT, jwtVerify, type JWTPayload } from "jose";

import { env } from "@/lib/env";
import type { Role } from "@/shared/enums";

/**
 * Custom JWT sessions (no Auth.js). `jose` is used because it runs in both the
 * Node and Edge runtimes, so middleware can verify a session without Prisma.
 */

const ISSUER = "healthlocker";
const AUDIENCE = "healthlocker.app";

const secret = new TextEncoder().encode(env.AUTH_JWT_SECRET);

export type TokenType = "access" | "refresh";

export interface SessionClaims extends JWTPayload {
  sub: string; // userId
  typ: TokenType;
  role: Role;
  orgId: string | null; // active tenant; null for patients/platform users
  mustChangePassword: boolean;
  sid: string; // session id — lets an admin revoke a single session
}

export type SessionClaimsInput = Omit<SessionClaims, "typ" | "iat" | "exp" | "iss" | "aud">;

export async function signToken(claims: SessionClaimsInput, type: TokenType): Promise<string> {
  const ttl = type === "access" ? env.AUTH_ACCESS_TOKEN_TTL : env.AUTH_REFRESH_TOKEN_TTL;

  return new SignJWT({ ...claims, typ: type })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .sign(secret);
}

/**
 * Verifies signature, issuer, audience and expiry. Returns null on any failure —
 * callers treat that as "not authenticated", never as a server error.
 */
export async function verifyToken(token: string, expected: TokenType): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify<SessionClaims>(token, secret, {
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    if (payload.typ !== expected) return null;

    return payload;
  } catch {
    return null;
  }
}
