import { describe, expect, it } from "vitest";

import {
  base32Decode,
  base32Encode,
  buildTotpUri,
  generateTotp,
  generateTotpSecret,
  verifyTotp,
} from "@/lib/auth/totp";

describe("base32", () => {
  it("round-trips arbitrary bytes", () => {
    const buffer = Buffer.from([0xde, 0xad, 0xbe, 0xef, 0x00, 0x11]);
    expect(base32Decode(base32Encode(buffer)).equals(buffer)).toBe(true);
  });

  it("matches RFC 4648 vectors", () => {
    expect(base32Encode(Buffer.from("foobar"))).toBe("MZXW6YTBOI");
    expect(base32Decode("MZXW6YTBOI").toString()).toBe("foobar");
  });

  it("tolerates padding, whitespace and lowercase", () => {
    expect(base32Decode("mzxw 6ytb oi==").toString()).toBe("foobar");
  });

  it("rejects an invalid character", () => {
    expect(() => base32Decode("MZXW1")).toThrow(/Invalid base32/);
  });
});

describe("TOTP", () => {
  // RFC 6238 test vector: ASCII "12345678901234567890" as base32.
  const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

  it("matches the RFC 6238 reference vector", () => {
    // t = 59s → counter 1 → 94287082, truncated to 6 digits.
    expect(generateTotp(RFC_SECRET, 59_000)).toBe("287082");
  });

  it("generates a 160-bit secret", () => {
    const secret = generateTotpSecret();
    expect(base32Decode(secret)).toHaveLength(20);
    expect(generateTotpSecret()).not.toBe(secret);
  });

  it("accepts the current code", () => {
    const secret = generateTotpSecret();
    const now = 1_700_000_000_000;
    expect(verifyTotp(secret, generateTotp(secret, now), { atMs: now })).toBe(true);
  });

  it("tolerates one step of clock drift in each direction", () => {
    const secret = generateTotpSecret();
    const now = 1_700_000_000_000;

    expect(verifyTotp(secret, generateTotp(secret, now - 30_000), { atMs: now })).toBe(true);
    expect(verifyTotp(secret, generateTotp(secret, now + 30_000), { atMs: now })).toBe(true);
  });

  it("rejects a code two steps away", () => {
    const secret = generateTotpSecret();
    const now = 1_700_000_000_000;

    expect(verifyTotp(secret, generateTotp(secret, now - 90_000), { atMs: now })).toBe(false);
  });

  it("rejects another account's code", () => {
    const now = 1_700_000_000_000;
    const code = generateTotp(generateTotpSecret(), now);

    expect(verifyTotp(generateTotpSecret(), code, { atMs: now })).toBe(false);
  });

  it("rejects malformed input rather than throwing", () => {
    const secret = generateTotpSecret();

    for (const bad of ["", "12345", "1234567", "abcdef", "12 34 56"]) {
      expect(verifyTotp(secret, bad)).toBe(false);
    }
  });
});

describe("enrolment URI", () => {
  it("builds an otpauth URI an authenticator app can read", () => {
    const uri = buildTotpUri("JBSWY3DPEHPK3PXP", "priya.demo");

    expect(uri.startsWith("otpauth://totp/HealthLocker%3Apriya.demo?")).toBe(true);
    expect(uri).toContain("secret=JBSWY3DPEHPK3PXP");
    expect(uri).toContain("issuer=HealthLocker");
    expect(uri).toContain("digits=6");
    expect(uri).toContain("period=30");
  });
});
