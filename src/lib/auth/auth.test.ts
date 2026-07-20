import { describe, expect, it } from "vitest";

import { signToken, verifyToken } from "@/lib/auth/jwt";
import {
  generateTemporaryPassword,
  hashPassword,
  suggestUsername,
  verifyPassword,
} from "@/lib/auth/password";

const claims = {
  sub: "user_123",
  role: "SUPER_ADMIN" as const,
  orgId: null,
  mustChangePassword: true,
  sid: "sess_abc",
};

describe("password hashing", () => {
  it("verifies a correct password and rejects a wrong one", async () => {
    const digest = await hashPassword("correct horse battery staple");

    expect(digest.startsWith("$argon2id$")).toBe(true);
    await expect(verifyPassword(digest, "correct horse battery staple")).resolves.toBe(true);
    await expect(verifyPassword(digest, "wrong password")).resolves.toBe(false);
  });

  it("salts each hash so identical passwords differ", async () => {
    const [a, b] = await Promise.all([hashPassword("same-password"), hashPassword("same-password")]);
    expect(a).not.toBe(b);
  });

  it("returns false rather than throwing on a malformed digest", async () => {
    await expect(verifyPassword("not-a-hash", "anything")).resolves.toBe(false);
  });
});

describe("temporary credentials", () => {
  it("generates passwords free of glyphs a human could misread", () => {
    for (let i = 0; i < 50; i += 1) {
      const password = generateTemporaryPassword();
      expect(password).toHaveLength(14);
      expect(password).not.toMatch(/[0O1lI]/);
    }
  });

  it("derives a slug-safe username suggestion", () => {
    const username = suggestUsername("Dr. Anita  Roy");
    expect(username).toMatch(/^dr\.anita\.roy\.[a-z2-9]{4}$/);
  });
});

describe("session tokens", () => {
  it("round-trips claims in an access token", async () => {
    const token = await signToken(claims, "access");
    const payload = await verifyToken(token, "access");

    expect(payload).toMatchObject({ ...claims, typ: "access" });
  });

  it("rejects a refresh token presented as an access token", async () => {
    const refresh = await signToken(claims, "refresh");
    await expect(verifyToken(refresh, "access")).resolves.toBeNull();
  });

  it("rejects a tampered token", async () => {
    const token = await signToken(claims, "access");
    const tampered = `${token.slice(0, -3)}aaa`;

    await expect(verifyToken(tampered, "access")).resolves.toBeNull();
  });
});
