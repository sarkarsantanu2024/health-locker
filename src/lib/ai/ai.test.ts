import { describe, expect, it } from "vitest";

import { getAiService } from "@/lib/ai";
import { LOW_CONFIDENCE_THRESHOLD } from "@/lib/ai/types";

const ai = getAiService();

describe("AI adapter selection", () => {
  it("returns the deterministic mock by default", () => {
    expect(ai.constructor.name).toBe("MockAiService");
    expect(getAiService()).toBe(ai);
  });
});

describe("mock: extractMedicines", () => {
  const prescription = [
    "Tab. Amoxicillin 500mg - 1-0-1 x 5 days",
    "Cap. Omeprazole 20mg - 1-0-0 x 14 days",
    "Paracetamol 650mg",
    "follow up in two weeks",
  ].join("\n");

  it("structures dose, frequency and duration", async () => {
    const { medicines } = await ai.extractMedicines({ text: prescription });

    expect(medicines.map((m) => m.name)).toEqual(["Amoxicillin", "Omeprazole", "Paracetamol"]);
    expect(medicines[0]).toMatchObject({ dose: "500mg", frequency: "1-0-1", duration: "5 days" });
  });

  it("flags an incomplete line as low confidence so a human confirms it", async () => {
    const { medicines } = await ai.extractMedicines({ text: prescription });
    const paracetamol = medicines.find((m) => m.name === "Paracetamol");

    expect(paracetamol?.confidence).toBeLessThan(LOW_CONFIDENCE_THRESHOLD);
  });

  it("is deterministic", async () => {
    const [a, b] = await Promise.all([
      ai.extractMedicines({ text: prescription }),
      ai.extractMedicines({ text: prescription }),
    ]);

    expect(a).toEqual(b);
  });
});

describe("mock: detectDrugInteractions", () => {
  it("raises a major alert for a known dangerous pair", async () => {
    const { interactions } = await ai.detectDrugInteractions({
      medicines: ["Warfarin 5mg", "Aspirin 75mg", "Paracetamol 650mg"],
    });

    expect(interactions).toHaveLength(1);
    expect(interactions[0].severity).toBe("MAJOR");
  });

  it("returns nothing for a safe list", async () => {
    const { interactions } = await ai.detectDrugInteractions({
      medicines: ["Paracetamol 650mg", "Vitamin D3"],
    });

    expect(interactions).toEqual([]);
  });
});

describe("mock: analyzeReport", () => {
  it("flags values outside the reference range", async () => {
    const { findings, plainSummary } = await ai.analyzeReport({
      text: "Haemoglobin: 9.1 g/dL\nGlucose: 88 mg/dL",
    });

    expect(findings).toHaveLength(2);
    expect(findings[0]).toMatchObject({ label: "Haemoglobin", flag: "LOW" });
    expect(findings[1].flag).toBe("NORMAL");
    expect(plainSummary).toContain("Haemoglobin (low)");
  });
});

describe("mock: detectDuplicates", () => {
  it("groups records with the same title on the same day", async () => {
    const { duplicates } = await ai.detectDuplicates({
      records: [
        { id: "a", title: "CBC Report", occurredAt: "2026-03-01T09:00:00Z" },
        { id: "b", title: "cbc  report", occurredAt: "2026-03-01T18:30:00Z" },
        { id: "c", title: "Lipid Profile", occurredAt: "2026-03-01T09:00:00Z" },
      ],
    });

    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].recordIds).toEqual(["a", "b"]);
  });
});

describe("mock: ocr + summarize", () => {
  it("round-trips text through OCR with provenance", async () => {
    const result = await ai.ocr({
      buffer: new TextEncoder().encode("Rx: Amoxicillin 500mg"),
      mimeType: "image/png",
      sourceKey: "uploads/demo.png",
    });

    expect(result.text).toBe("Rx: Amoxicillin 500mg");
    expect(result.provenance).toMatchObject({ provider: "mock", sourceUploadKey: "uploads/demo.png" });
  });

  it("truncates a summary to the requested word budget", async () => {
    const { summary } = await ai.summarize({ text: "one two three four five", maxWords: 3 });
    expect(summary).toBe("one two three…");
  });
});
