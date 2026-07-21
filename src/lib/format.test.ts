import { describe, expect, it } from "vitest";

import {
  ageFrom,
  addDays,
  dayRange,
  formatDate,
  humanizeEnum,
  money,
  toDateInputValue,
  toMinor,
  zonedTimeToUtc,
} from "@/lib/format";

describe("money", () => {
  it("renders paise as Indian rupees", () => {
    expect(money(129900)).toContain("1,299.00");
    expect(money(0)).toContain("0.00");
  });

  it("round-trips through paise without float drift", () => {
    // The reason money is an integer count of paise: 12.34 * 100 is 1233.9999…
    expect(toMinor(12.34)).toBe(1234);
    expect(toMinor(0.1 + 0.2)).toBe(30);
  });
});

describe("zonedTimeToUtc", () => {
  it("interprets a wall clock in Asia/Kolkata, not the server's zone", () => {
    // 08:00 IST is 02:30 UTC. A naive `new Date("...T08:00")` on a UTC server
    // would produce 08:00Z, which is 13:30 to the patient.
    const utc = zonedTimeToUtc(2026, 7, 21, 8, 0);
    expect(utc.toISOString()).toBe("2026-07-21T02:30:00.000Z");
  });

  it("handles a time that falls on the previous UTC day", () => {
    const utc = zonedTimeToUtc(2026, 7, 21, 4, 0);
    expect(utc.toISOString()).toBe("2026-07-20T22:30:00.000Z");
  });
});

describe("dayRange", () => {
  it("spans local midnight to midnight, not UTC midnight", () => {
    const { start, end } = dayRange(new Date("2026-07-21T12:00:00Z"));

    expect(start.toISOString()).toBe("2026-07-20T18:30:00.000Z");
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("puts a late-evening UTC instant in the NEXT local day", () => {
    // 20:00 UTC is 01:30 the following morning in Kolkata. A server-local
    // implementation would file it under the wrong day.
    const { start } = dayRange(new Date("2026-07-21T20:00:00Z"));
    expect(toDateInputValue(start)).toBe("2026-07-22");
  });
});

describe("ageFrom", () => {
  it("returns whole years", () => {
    const twentyYearsAgo = new Date();
    twentyYearsAgo.setFullYear(twentyYearsAgo.getFullYear() - 20);
    expect(ageFrom(twentyYearsAgo)).toBe(20);
  });

  it("returns null rather than 0 for a missing date of birth", () => {
    // A newborn is 0; an unknown date of birth is not. Conflating them would
    // print "0 yrs" against every patient whose DOB was never captured.
    expect(ageFrom(null)).toBeNull();
    expect(ageFrom(undefined)).toBeNull();
    expect(ageFrom("not a date")).toBeNull();
  });
});

describe("humanizeEnum", () => {
  it("turns an enum value into a sentence-case label", () => {
    expect(humanizeEnum("SAMPLE_COLLECTED")).toBe("Sample collected");
    expect(humanizeEnum("OPD")).toBe("Opd");
  });
});

describe("addDays / formatDate", () => {
  it("shifts by whole days", () => {
    const base = new Date("2026-07-21T06:00:00Z");
    expect(addDays(base, 1).toISOString()).toBe("2026-07-22T06:00:00.000Z");
    expect(addDays(base, -1).toISOString()).toBe("2026-07-20T06:00:00.000Z");
  });

  it("formats in the app timezone", () => {
    expect(formatDate("2026-07-21T20:00:00Z")).toContain("22");
  });
});
