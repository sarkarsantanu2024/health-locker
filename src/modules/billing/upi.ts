import { randomBytes } from "node:crypto";

import QRCode from "qrcode";

/**
 * UPI collection primitives. No payment gateway is involved: the payer's own UPI
 * app moves the money, and we reconcile by hand.
 */

/**
 * Reference code embedded in the UPI deep link's `tr` field.
 *
 * Deliberately NOT a cuid: several UPI apps truncate `tr`, and some reject
 * anything non-alphanumeric. Ten uppercase alphanumerics with the ambiguous
 * glyphs removed (0/O, 1/I) — a human reads this back over the phone.
 */
const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateRefCode(length = 10): string {
  const bytes = randomBytes(length * 2);
  let out = "HL";

  for (let i = 0; out.length < length; i += 1) {
    const byte = bytes[i % bytes.length];
    // Rejection sampling keeps the distribution even across the alphabet.
    if (byte < 256 - (256 % REF_ALPHABET.length)) {
      out += REF_ALPHABET[byte % REF_ALPHABET.length];
    }
  }

  return out;
}

export interface UpiLinkInput {
  vpa: string;
  payeeName: string;
  amountMinor: number;
  refCode: string;
  note?: string;
}

/**
 * Builds a `upi://pay?…` deep link. Tapping it on a phone opens GPay/PhonePe/
 * Paytm with the amount and reference already filled in — no gateway, no fee.
 *
 * `am` must be rupees with exactly two decimals; sending paise or an unformatted
 * float makes several apps silently drop the amount and show a blank field.
 */
export function buildUpiLink({ vpa, payeeName, amountMinor, refCode, note }: UpiLinkInput): string {
  const params = new URLSearchParams({
    pa: vpa,
    pn: payeeName,
    am: (amountMinor / 100).toFixed(2),
    cu: "INR",
    tr: refCode,
    tn: (note ?? `HealthLocker ${refCode}`).slice(0, 50),
  });

  return `upi://pay?${params.toString()}`;
}

/**
 * QR encoding the same deep link, so a payer on a desktop can scan with their
 * phone. Generated per request rather than uploaded as a static image — a static
 * QR cannot carry the amount or the reference code, which is what makes manual
 * reconciliation work at all.
 */
export async function upiQrSvg(input: UpiLinkInput): Promise<string> {
  return QRCode.toString(buildUpiLink(input), {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    width: 240,
  });
}

/**
 * Indian bank UTR / transaction reference. Formats vary by rail (12-digit UPI
 * RRN, 16-22 char NEFT/IMPS/RTGS), so this stays permissive on shape and strict
 * on charset — the real check is the human comparing it to a bank statement.
 */
export function normaliseUtr(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export function isPlausibleUtr(value: string): boolean {
  return /^[A-Z0-9]{6,32}$/.test(normaliseUtr(value));
}

export function formatMoney(minor: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(minor / 100);
}
