import { describe, expect, it } from "vitest";

import { KIND_ICON, KIND_LABEL, KIND_SINGULAR, kindTone } from "@/modules/patient/ui/record-kind";
import { TIMELINE_KINDS } from "@/modules/patient/timeline.service";
import { DOMAIN_TONE, TONE_STYLES } from "@/ui/tone";

/**
 * The colour system only works if it is total and stable: every timeline kind
 * has a hue, an icon and a word, and the hues that a patient learns by name do
 * not drift.
 */
describe("record kind vocabulary", () => {
  it("covers every timeline kind", () => {
    for (const kind of TIMELINE_KINDS) {
      expect(KIND_LABEL[kind], `${kind} label`).toBeTruthy();
      expect(KIND_SINGULAR[kind], `${kind} singular`).toBeTruthy();
      expect(KIND_ICON[kind], `${kind} icon`).toBeTruthy();
      expect(TONE_STYLES[kindTone(kind)], `${kind} tone`).toBeTruthy();
    }
  });

  it("keeps the hues a patient is taught", () => {
    expect(kindTone("PRESCRIPTION")).toBe("teal");
    expect(kindTone("REPORT")).toBe("violet");
    expect(kindTone("VACCINATION")).toBe("emerald");
    expect(kindTone("EXPENSE")).toBe("amber");
    expect(kindTone("DOCUMENT")).toBe("sky");
  });

  it("borrows its hues from the shared domain table rather than a second one", () => {
    expect(kindTone("PRESCRIPTION")).toBe(DOMAIN_TONE.prescription);
    expect(kindTone("REPORT")).toBe(DOMAIN_TONE.report);
    expect(kindTone("VACCINATION")).toBe(DOMAIN_TONE.vaccination);
    expect(kindTone("EXPENSE")).toBe(DOMAIN_TONE.expense);
    expect(kindTone("DOCUMENT")).toBe(DOMAIN_TONE.document);
    expect(kindTone("ENCOUNTER")).toBe(DOMAIN_TONE.appointment);
    expect(kindTone("ALLERGY")).toBe(DOMAIN_TONE.alert);
  });

  it("never leaves a record kind grey", () => {
    for (const kind of TIMELINE_KINDS) {
      expect(kindTone(kind), `${kind} must carry a hue`).not.toBe("neutral");
    }
  });
});
