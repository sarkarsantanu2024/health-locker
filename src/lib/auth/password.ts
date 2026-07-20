import { randomBytes } from "node:crypto";

import { hash, verify } from "@node-rs/argon2";

/**
 * Argon2id parameters. Tuned to stay well under a serverless function's CPU
 * budget while remaining OWASP-acceptable (>= 19 MiB memory, t=2).
 */
const ARGON2_OPTIONS = {
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON2_OPTIONS);
}

export async function verifyPassword(digest: string, plain: string): Promise<boolean> {
  try {
    return await verify(digest, plain, ARGON2_OPTIONS);
  } catch {
    // Malformed/legacy digest: treat as a failed login, never as a crash.
    return false;
  }
}

// Ambiguous glyphs (0/O, 1/l/I) are excluded: temporary passwords are read aloud
// or typed from a WhatsApp message by a human.
const TEMP_PASSWORD_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

/**
 * Generates the one-time password an admin hands over out-of-band. There is no
 * email delivery in this product — see Section 0.
 */
export function generateTemporaryPassword(length = 14): string {
  const alphabet = TEMP_PASSWORD_ALPHABET;
  const bytes = randomBytes(length * 2);
  let out = "";

  for (let i = 0; out.length < length; i += 1) {
    const byte = bytes[i % bytes.length];
    // Rejection sampling keeps the distribution uniform across the alphabet.
    if (byte < 256 - (256 % alphabet.length)) {
      out += alphabet[byte % alphabet.length];
    }
  }

  return out;
}

const USERNAME_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

/**
 * Suggests a username from a person's name plus a random suffix. The caller must
 * still check uniqueness against the User table.
 */
export function suggestUsername(fullName: string, suffixLength = 4): string {
  const base =
    fullName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ".")
      .replace(/^\.+|\.+$/g, "")
      .slice(0, 20) || "user";

  const bytes = randomBytes(suffixLength);
  const suffix = Array.from(bytes, (b) => USERNAME_ALPHABET[b % USERNAME_ALPHABET.length]).join("");

  return `${base}.${suffix}`;
}
