import { describe, expect, it } from "vitest";

import { NAV_BY_ROLE, PORTAL_LABEL } from "@/modules/identity/navigation";
import { ROLES } from "@/shared/enums";
import { TONES } from "@/ui/tone";

/**
 * The sidebar colours itself from `item.tone`. A missing or invented tone would
 * not fail the build — `TONE_STYLES[undefined]` throws only at render, on one
 * role's console — so the contract is asserted here instead.
 */
describe("portal navigation", () => {
  it("gives every role a nav and a portal label", () => {
    for (const role of ROLES) {
      expect(NAV_BY_ROLE[role]?.length ?? 0).toBeGreaterThan(0);
      expect(PORTAL_LABEL[role]).toBeTruthy();
    }
  });

  it("gives every nav item a tone from the palette", () => {
    for (const role of ROLES) {
      for (const item of NAV_BY_ROLE[role]) {
        expect(TONES, `${role} → ${item.label}`).toContain(item.tone);
      }
    }
  });

  it("never lists the same destination twice in one portal", () => {
    for (const role of ROLES) {
      const hrefs = NAV_BY_ROLE[role].map((item) => item.href);
      expect(new Set(hrefs).size, role).toBe(hrefs.length);
    }
  });

  it("keeps the shared destinations on one hue across every portal", () => {
    // Alerts and Account appear in all seven portals; drift there is the most
    // visible kind, because the two sit side by side at the foot of the sidebar.
    const shared = new Map<string, string>();

    for (const role of ROLES) {
      for (const item of NAV_BY_ROLE[role].filter((entry) => entry.href.startsWith("/notifications") || entry.href.startsWith("/account"))) {
        const seen = shared.get(item.href);
        if (seen) expect(item.tone, item.href).toBe(seen);
        else shared.set(item.href, item.tone);
      }
    }

    expect(shared.size).toBe(2);
  });
});
