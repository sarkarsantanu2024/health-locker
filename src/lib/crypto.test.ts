import { describe, expect, it } from "vitest";

// ENCRYPTION_KEY is set in vitest.setup.ts — src/lib/env.ts parses process.env at
// import time, so it has to be in place before this module is even loaded.
import {
  decrypt,
  decryptNullable,
  encrypt,
  encryptNullable,
  maskIdentifier,
  safeEqual,
} from "@/lib/crypto";

describe("column encryption", () => {
  it("round-trips a value", () => {
    const plaintext = "healthlocker@upi";
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it("produces a different ciphertext each time (random nonce)", () => {
    const a = encrypt("000011112222");
    const b = encrypt("000011112222");

    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe(decrypt(b));
  });

  it("emits a versioned envelope so the key can be rotated later", () => {
    expect(encrypt("x").startsWith("v1.")).toBe(true);
    expect(encrypt("x").split(".")).toHaveLength(4);
  });

  it("refuses a tampered ciphertext rather than returning garbage", () => {
    const [version, iv, tag, data] = encrypt("SBIN0001234").split(".");
    const flipped = Buffer.from(data, "base64");
    flipped[0] ^= 0xff;

    expect(() => decrypt([version, iv, tag, flipped.toString("base64")].join("."))).toThrow();
  });

  it("refuses a tampered auth tag", () => {
    const [version, iv, , data] = encrypt("SBIN0001234").split(".");
    const forgedTag = Buffer.alloc(16).toString("base64");

    expect(() => decrypt([version, iv, forgedTag, data].join("."))).toThrow();
  });

  it("rejects a malformed envelope", () => {
    expect(() => decrypt("not-encrypted")).toThrow(/Malformed ciphertext/);
    expect(() => decrypt("v2.a.b.c")).toThrow(/Malformed ciphertext/);
  });

  it("passes null and empty through untouched", () => {
    expect(encryptNullable(null)).toBeNull();
    expect(encryptNullable("")).toBeNull();
    expect(decryptNullable(null)).toBeNull();
    expect(decryptNullable(encryptNullable("abc"))).toBe("abc");
  });

  it("handles unicode and long values", () => {
    const value = "श्रीमती प्रिया शर्मा — ".repeat(50);
    expect(decrypt(encrypt(value))).toBe(value);
  });
});

describe("maskIdentifier", () => {
  it("keeps only the trailing characters", () => {
    expect(maskIdentifier("000011112222")).toBe("••••••••2222");
    expect(maskIdentifier("123", 4)).toBe("•••");
  });
});

describe("safeEqual", () => {
  it("compares equal and unequal values", () => {
    expect(safeEqual("token-abc", "token-abc")).toBe(true);
    expect(safeEqual("token-abc", "token-abd")).toBe(false);
    expect(safeEqual("short", "longer-value")).toBe(false);
  });
});
