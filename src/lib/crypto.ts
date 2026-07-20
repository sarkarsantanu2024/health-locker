import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

import { requireEncryptionKey } from "@/lib/env";

/**
 * Application-level encryption for sensitive columns (UPI VPA, bank account,
 * policy number, ABHA id, TOTP secret).
 *
 * Neon encrypts at rest already; this protects against a different threat — a
 * leaked dump, an over-broad SELECT, or a support engineer reading a table. The
 * key lives only in the environment, never in the database.
 *
 * Format: v1.<iv-b64>.<tag-b64>.<ciphertext-b64>. The version prefix is what
 * makes key rotation possible later without guessing at the payload shape.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit nonce, the GCM standard
const VERSION = "v1";

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (!cachedKey) {
    const raw = requireEncryptionKey();
    const key = Buffer.from(raw, "base64");

    if (key.length !== 32) {
      throw new Error(
        `ENCRYPTION_KEY must decode to 32 bytes for AES-256 (got ${key.length}). ` +
          `Generate one with: openssl rand -base64 32`,
      );
    }

    cachedKey = key;
  }

  return cachedKey;
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [VERSION, iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(".");
}

export function decrypt(payload: string): string {
  const parts = payload.split(".");

  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Malformed ciphertext: expected v1.<iv>.<tag>.<data>.");
  }

  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));

  // GCM authentication fails here if the ciphertext or tag was tampered with.
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

/** Convenience for nullable columns — encrypt(null) should stay null. */
export function encryptNullable(value: string | null | undefined): string | null {
  return value == null || value === "" ? null : encrypt(value);
}

export function decryptNullable(value: string | null | undefined): string | null {
  return value == null || value === "" ? null : decrypt(value);
}

/**
 * Masks a decrypted identifier for display, keeping the last `visible` chars.
 * Admin screens should show this, not the full value.
 */
export function maskIdentifier(value: string, visible = 4): string {
  if (value.length <= visible) return "•".repeat(value.length);
  return "•".repeat(value.length - visible) + value.slice(-visible);
}

/** Constant-time comparison, for tokens compared outside of a hash verify. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);

  // timingSafeEqual throws on length mismatch, which itself leaks length; compare
  // a fixed-size digest-shaped pair instead by short-circuiting on length only.
  if (bufA.length !== bufB.length) return false;

  return timingSafeEqual(bufA, bufB);
}
