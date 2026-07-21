/**
 * Formatting and timezone helpers, shared by every screen.
 *
 * Everything is India-first: `en-IN`, rupees, and `Asia/Kolkata`. The timezone
 * is explicit in every call rather than left to the runtime, because a Vercel
 * function runs in UTC — without it, "today's appointments" would roll over at
 * 5:30am local and a 1am dose would be filed under the previous day.
 */

export const APP_TIME_ZONE = "Asia/Kolkata";

// --- money -----------------------------------------------------------------

/** Paise → "₹1,299.00". Money is always an integer count of paise, never a float. */
export function money(minor: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}

/** Rupees typed by a human → paise. Rounds, because 12.345 is not a real price. */
export function toMinor(rupees: number): number {
  return Math.round(rupees * 100);
}

// --- dates -----------------------------------------------------------------

type DateInput = Date | string | number;

function asDate(value: DateInput): Date {
  return value instanceof Date ? value : new Date(value);
}

export function formatDate(value: DateInput, timeZone = APP_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone }).format(asDate(value));
}

export function formatDateTime(value: DateInput, timeZone = APP_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(asDate(value));
}

export function formatTime(value: DateInput, timeZone = APP_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-IN", { timeStyle: "short", timeZone }).format(asDate(value));
}

/** "2026-07-21" in the given zone — the value an `<input type="date">` wants. */
export function toDateInputValue(value: DateInput, timeZone = APP_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(asDate(value));
}

/** "2026-07-21T14:30" — the value an `<input type="datetime-local">` wants. */
export function toDateTimeInputValue(value: DateInput, timeZone = APP_TIME_ZONE): string {
  const parts = zoneParts(asDate(value), timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function zoneParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    // Intl renders midnight as "24" in some engines under hour12: false.
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
  };
}

function zoneOffsetMs(date: Date, timeZone: string): number {
  const p = zoneParts(date, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - date.getTime();
}

/**
 * A wall-clock time in `timeZone` → the UTC instant it refers to.
 *
 * Done by guessing the instant and correcting by the zone's offset *at that
 * instant*, so it stays right across a DST boundary. India has no DST, but the
 * schedule engine should not encode that assumption.
 */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone = APP_TIME_ZONE,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const offset = zoneOffsetMs(new Date(guess), timeZone);
  return new Date(guess - offset);
}

/** Midnight-to-midnight in the app timezone, for "today" style queries. */
export function dayRange(value: DateInput = new Date(), timeZone = APP_TIME_ZONE) {
  const p = zoneParts(asDate(value), timeZone);
  const start = zonedTimeToUtc(p.year, p.month, p.day, 0, 0, timeZone);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  return { start, end };
}

/** Same date as `value`, shifted by whole days, keeping the local wall clock. */
export function addDays(value: DateInput, days: number): Date {
  return new Date(asDate(value).getTime() + days * 24 * 60 * 60 * 1000);
}

// --- text ------------------------------------------------------------------

/** "SAMPLE_COLLECTED" → "Sample collected". Enum values are not display strings. */
export function humanizeEnum(value: string): string {
  const spaced = value.replace(/_/g, " ").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Whole years, for a date of birth. Null in, null out — age is not "0". */
export function ageFrom(dateOfBirth: Date | string | null | undefined): number | null {
  if (!dateOfBirth) return null;

  const dob = asDate(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;

  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - dob.getUTCMonth();

  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < dob.getUTCDate())) age -= 1;

  return age >= 0 && age < 150 ? age : null;
}
