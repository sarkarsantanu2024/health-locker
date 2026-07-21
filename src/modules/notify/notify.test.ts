import { describe, expect, it } from "vitest";

import { isWithinQuietHours, whatsappLink } from "@/modules/notify/notify.service";
import { notificationTypesForRole } from "@/modules/notify/catalog";

/**
 * Quiet hours have to wrap midnight — "22:00 to 07:00" is the normal case, and a
 * naive `start < now < end` comparison never matches it, so pushes would arrive
 * at 3am and nobody would notice until a patient complained.
 */
describe("isWithinQuietHours", () => {
  const at = (hhmm: string) => new Date(`2026-07-21T${hhmm}:00+05:30`);

  it("matches a window that wraps midnight", () => {
    expect(isWithinQuietHours(at("23:30"), "22:00", "07:00")).toBe(true);
    expect(isWithinQuietHours(at("03:00"), "22:00", "07:00")).toBe(true);
    expect(isWithinQuietHours(at("06:59"), "22:00", "07:00")).toBe(true);
  });

  it("does not match outside a wrapping window", () => {
    expect(isWithinQuietHours(at("07:00"), "22:00", "07:00")).toBe(false);
    expect(isWithinQuietHours(at("12:00"), "22:00", "07:00")).toBe(false);
    expect(isWithinQuietHours(at("21:59"), "22:00", "07:00")).toBe(false);
  });

  it("matches a same-day window", () => {
    expect(isWithinQuietHours(at("14:00"), "13:00", "15:00")).toBe(true);
    expect(isWithinQuietHours(at("16:00"), "13:00", "15:00")).toBe(false);
  });

  it("is inactive when either end is unset", () => {
    expect(isWithinQuietHours(at("03:00"), null, "07:00")).toBe(false);
    expect(isWithinQuietHours(at("03:00"), "22:00", null)).toBe(false);
    expect(isWithinQuietHours(at("03:00"), null, null)).toBe(false);
  });

  it("reads the clock in the user's timezone, not the server's", () => {
    // 20:00 UTC is 01:30 in Kolkata — inside a 22:00–07:00 window there, but
    // outside it in UTC. A server-local comparison would push at 1:30am.
    const instant = new Date("2026-07-21T20:00:00Z");

    expect(isWithinQuietHours(instant, "22:00", "07:00", "Asia/Kolkata")).toBe(true);
    expect(isWithinQuietHours(instant, "22:00", "07:00", "UTC")).toBe(false);
  });
});

describe("whatsappLink", () => {
  it("normalises an Indian mobile to the international form wa.me needs", () => {
    expect(whatsappLink("9830011223", "hello")).toContain("wa.me/919830011223");
    expect(whatsappLink("+91 98300 11223", "hello")).toContain("wa.me/919830011223");
    expect(whatsappLink("98300-11223", "hello")).toContain("wa.me/919830011223");
  });

  it("url-encodes the message", () => {
    expect(whatsappLink("9830011223", "Rs 500 due & overdue")).toContain(
      "text=Rs%20500%20due%20%26%20overdue",
    );
  });
});

describe("notificationTypesForRole", () => {
  it("offers a pharmacist stock expiry and a patient medicine reminders", () => {
    expect(notificationTypesForRole("PHARMACY_ADMIN")).toContain("STOCK_EXPIRY");
    expect(notificationTypesForRole("PATIENT")).toContain("MEDICINE_REMINDER");
  });

  it("does not offer a toggle for something the role can never receive", () => {
    // An empty switch is worse than an absent one: it implies the person could
    // be getting these and simply is not.
    expect(notificationTypesForRole("PHARMACY_ADMIN")).not.toContain("MEDICINE_REMINDER");
    expect(notificationTypesForRole("CLINIC_STAFF")).not.toContain("STOCK_EXPIRY");
    expect(notificationTypesForRole("SUPER_ADMIN")).not.toContain("VACCINATION_DUE");
  });
});
