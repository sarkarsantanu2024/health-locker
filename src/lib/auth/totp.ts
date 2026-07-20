import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * TOTP (RFC 6238) over HMAC-SHA1 with 6 digits and a 30-second step — the
 * combination every authenticator app supports.
 *
 * Implemented directly on node:crypto rather than pulling a dependency: it is
 * ~40 lines of well-specified arithmetic, and an auth primitive is a poor place
 * to inherit someone else's supply chain.
 *
 * This is the ONLY second factor in the product. There is no email and no SMS.
 */

const DIGITS = 6;
const STEP_SECONDS = 30;
/** Accept the adjacent steps so a slightly skewed phone clock still works. */
const DEFAULT_WINDOW = 1;

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];

  return output;
}

export function base32Decode(input: string): Buffer {
  const cleaned = input.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const char of cleaned) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error(`Invalid base32 character: ${char}`);

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/** 160-bit secret, the RFC 4226 recommendation for HMAC-SHA1. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

function hotp(secret: Buffer, counter: number): string {
  const counterBuffer = Buffer.alloc(8);
  // Counter is 64-bit big-endian; write as two 32-bit halves to stay safe on
  // platforms without reliable BigInt buffer writes.
  counterBuffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuffer.writeUInt32BE(counter >>> 0, 4);

  const digest = createHmac("sha1", secret).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return (binary % 10 ** DIGITS).toString().padStart(DIGITS, "0");
}

export function generateTotp(secretBase32: string, atMs: number = Date.now()): string {
  return hotp(base32Decode(secretBase32), Math.floor(atMs / 1000 / STEP_SECONDS));
}

/**
 * Verifies a submitted code, tolerating `window` steps of clock drift either way.
 * Comparison is constant-time so a timing side channel cannot reveal the digits.
 */
export function verifyTotp(
  secretBase32: string,
  token: string,
  options: { atMs?: number; window?: number } = {},
): boolean {
  const { atMs = Date.now(), window = DEFAULT_WINDOW } = options;
  const candidate = token.trim();

  if (!/^\d{6}$/.test(candidate)) return false;

  const secret = base32Decode(secretBase32);
  const counter = Math.floor(atMs / 1000 / STEP_SECONDS);
  const submitted = Buffer.from(candidate);

  for (let drift = -window; drift <= window; drift += 1) {
    const expected = Buffer.from(hotp(secret, counter + drift));
    if (expected.length === submitted.length && timingSafeEqual(expected, submitted)) return true;
  }

  return false;
}

/**
 * `otpauth://` URI for the enrolment QR code. The issuer appears as the account
 * name in the authenticator app, so it must be stable and recognisable.
 */
export function buildTotpUri(secretBase32: string, username: string, issuer = "HealthLocker"): string {
  const label = encodeURIComponent(`${issuer}:${username}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });

  return `otpauth://totp/${label}?${params.toString()}`;
}
