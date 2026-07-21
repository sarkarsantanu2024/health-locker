import { describe, expect, it } from "vitest";

import { daysFromDuration, timesFromFrequency } from "@/modules/patient/medication.service";

/**
 * Turning what a doctor wrote into reminder times.
 *
 * The rule these tests pin down: an unrecognised frequency produces ONE morning
 * dose, not a guess. Over-reminding a patient about a drug is worse than
 * under-reminding, because it teaches them to ignore the reminders.
 */
describe("timesFromFrequency", () => {
  it("reads the Indian morning-afternoon-night convention", () => {
    expect(timesFromFrequency("1-0-1")).toEqual(["08:00", "20:00"]);
    expect(timesFromFrequency("1-1-1")).toEqual(["08:00", "14:00", "20:00"]);
    expect(timesFromFrequency("0-0-1")).toEqual(["20:00"]);
    expect(timesFromFrequency("1-0-0")).toEqual(["08:00"]);
  });

  it("reads the Latin abbreviations", () => {
    expect(timesFromFrequency("BD")).toEqual(["08:00", "20:00"]);
    expect(timesFromFrequency("tds")).toEqual(["08:00", "14:00", "20:00"]);
    expect(timesFromFrequency("QID")).toEqual(["08:00", "12:00", "16:00", "20:00"]);
    expect(timesFromFrequency("HS")).toEqual(["21:00"]);
    expect(timesFromFrequency("OD")).toEqual(["08:00"]);
  });

  it("reads plain English", () => {
    expect(timesFromFrequency("twice daily")).toEqual(["08:00", "20:00"]);
    expect(timesFromFrequency("three times a day")).toEqual(["08:00", "14:00", "20:00"]);
    expect(timesFromFrequency("at night")).toEqual(["21:00"]);
  });

  it("falls back to a single morning dose for anything it does not understand", () => {
    expect(timesFromFrequency("as needed")).toEqual(["08:00"]);
    expect(timesFromFrequency("")).toEqual(["08:00"]);
    expect(timesFromFrequency(null)).toEqual(["08:00"]);
    expect(timesFromFrequency(undefined)).toEqual(["08:00"]);
  });
});

describe("daysFromDuration", () => {
  it("converts days, weeks and months", () => {
    expect(daysFromDuration("5 days")).toBe(5);
    expect(daysFromDuration("2 weeks")).toBe(14);
    expect(daysFromDuration("1 month")).toBe(30);
    expect(daysFromDuration("10 Days")).toBe(10);
  });

  it("returns null for open-ended or unparseable text", () => {
    // Null means "no end date", which is right for a long-term medicine — a
    // default of, say, 7 days would silently stop a blood-pressure reminder.
    expect(daysFromDuration("ongoing")).toBeNull();
    expect(daysFromDuration("")).toBeNull();
    expect(daysFromDuration(null)).toBeNull();
    expect(daysFromDuration("0 days")).toBeNull();
  });
});
