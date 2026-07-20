import type {
  AiService,
  AnalyzeReportResult,
  DrugInteractionResult,
  DuplicateResult,
  ExtractMedicinesResult,
  InteractionSeverity,
  OcrResult,
  Provenance,
  ReportFinding,
  SummarizeResult,
} from "@/lib/ai/types";

/**
 * Deterministic AI adapter for dev and tests: same input always yields the same
 * output, no network, no quota. Tests assert against it directly.
 */

const PROVIDER = "mock";
const MODEL = "mock-v1";

function provenance(confidence: number, sourceUploadKey?: string): Provenance {
  return { provider: PROVIDER, model: MODEL, confidence, ...(sourceUploadKey ? { sourceUploadKey } : {}) };
}

/**
 * Matches lines shaped like: `Tab. Amoxicillin 500mg - 1-0-1 x 5 days`
 * Deliberately simple: the real adapter uses an LLM; this only needs to be stable.
 */
const MEDICINE_LINE =
  /^\s*(?:tab\.?|cap\.?|syp\.?|inj\.?)?\s*([A-Za-z][A-Za-z\s-]{2,40}?)\s+(\d+\s*(?:mg|mcg|ml|g|iu))\b(?:[^\n]*?\b(\d[-\d]*\d|od|bd|tds|qid|hs|sos)\b)?(?:[^\n]*?\bx\s*(\d+\s*(?:day|days|week|weeks|month|months))\b)?/i;

/** A tiny, obviously-incomplete table. The real adapter replaces this entirely. */
const KNOWN_INTERACTIONS: Array<{ a: string; b: string; severity: InteractionSeverity; description: string }> = [
  {
    a: "warfarin",
    b: "aspirin",
    severity: "MAJOR",
    description: "Additive bleeding risk; both impair haemostasis.",
  },
  {
    a: "warfarin",
    b: "ibuprofen",
    severity: "MAJOR",
    description: "NSAIDs increase bleeding risk and displace warfarin from protein binding.",
  },
  {
    a: "metformin",
    b: "contrast",
    severity: "MODERATE",
    description: "Risk of lactic acidosis around iodinated contrast administration.",
  },
  {
    a: "simvastatin",
    b: "clarithromycin",
    severity: "CONTRAINDICATED",
    description: "CYP3A4 inhibition raises statin levels; risk of rhabdomyolysis.",
  },
];

const REFERENCE_RANGES: Record<string, { low: number; high: number; unit: string }> = {
  haemoglobin: { low: 13, high: 17, unit: "g/dL" },
  hemoglobin: { low: 13, high: 17, unit: "g/dL" },
  glucose: { low: 70, high: 100, unit: "mg/dL" },
  cholesterol: { low: 0, high: 200, unit: "mg/dL" },
  creatinine: { low: 0.7, high: 1.3, unit: "mg/dL" },
};

export class MockAiService implements AiService {
  async ocr(input: { buffer?: Uint8Array; url?: string; mimeType: string; sourceKey?: string }): Promise<OcrResult> {
    // A real OCR pass would decode the image; the mock echoes any UTF-8 payload so
    // tests can feed a fixture through the whole pipeline.
    const text = input.buffer ? new TextDecoder().decode(input.buffer) : (input.url ?? "");

    return { text, pages: [text], provenance: provenance(0.99, input.sourceKey) };
  }

  async extractMedicines(input: { text: string; sourceKey?: string }): Promise<ExtractMedicinesResult> {
    const medicines = input.text
      .split(/\r?\n/)
      .map((line) => MEDICINE_LINE.exec(line))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => {
        const [, name, dose, frequency, duration] = m;
        // Confidence degrades with each field the line did not state.
        const confidence = 0.95 - (frequency ? 0 : 0.15) - (duration ? 0 : 0.15);

        return {
          name: name.trim(),
          dose: dose.replace(/\s+/g, ""),
          ...(frequency ? { frequency: frequency.toLowerCase() } : {}),
          ...(duration ? { duration: duration.toLowerCase() } : {}),
          confidence: Number(confidence.toFixed(2)),
        };
      });

    const avg = medicines.length
      ? medicines.reduce((sum, m) => sum + m.confidence, 0) / medicines.length
      : 0;

    return { medicines, provenance: provenance(Number(avg.toFixed(2)), input.sourceKey) };
  }

  async analyzeReport(input: { text: string; sourceKey?: string }): Promise<AnalyzeReportResult> {
    const findings: ReportFinding[] = input.text
      .split(/\r?\n/)
      .map((line) => /^\s*([A-Za-z][A-Za-z\s]{2,30}?)\s*[:=]\s*([\d.]+)\s*([A-Za-z/%]+)?/.exec(line))
      .filter((m): m is RegExpExecArray => m !== null)
      .map(([, rawLabel, rawValue, unit]) => {
        const label = rawLabel.trim();
        const range = REFERENCE_RANGES[label.toLowerCase()];
        const value = Number(rawValue);

        let flag: ReportFinding["flag"] = "UNKNOWN";
        if (range) {
          if (value < range.low) flag = "LOW";
          else if (value > range.high) flag = "HIGH";
          else flag = "NORMAL";
        }

        return {
          label,
          value: rawValue,
          ...(unit ?? range?.unit ? { unit: unit ?? range!.unit } : {}),
          ...(range ? { referenceRange: `${range.low}-${range.high} ${range.unit}` } : {}),
          flag,
        };
      });

    const abnormal = findings.filter((f) => f.flag === "LOW" || f.flag === "HIGH" || f.flag === "CRITICAL");

    return {
      findings,
      plainSummary: abnormal.length
        ? `${abnormal.length} of ${findings.length} values are outside the usual range: ${abnormal
            .map((f) => `${f.label} (${f.flag.toLowerCase()})`)
            .join(", ")}. Discuss these with your doctor.`
        : `All ${findings.length} recorded values are within the usual range.`,
      provenance: provenance(findings.length ? 0.9 : 0.2, input.sourceKey),
    };
  }

  async summarize(input: { text: string; maxWords?: number }): Promise<SummarizeResult> {
    const maxWords = input.maxWords ?? 60;
    const words = input.text.trim().split(/\s+/).filter(Boolean);
    const summary = words.slice(0, maxWords).join(" ") + (words.length > maxWords ? "…" : "");

    return { summary, provenance: provenance(0.8) };
  }

  async detectDrugInteractions(input: { medicines: string[] }): Promise<DrugInteractionResult> {
    const names = input.medicines.map((m) => m.toLowerCase().trim());
    const interactions = [];

    for (let i = 0; i < names.length; i += 1) {
      for (let j = i + 1; j < names.length; j += 1) {
        const known = KNOWN_INTERACTIONS.find(
          (k) =>
            (names[i].includes(k.a) && names[j].includes(k.b)) ||
            (names[i].includes(k.b) && names[j].includes(k.a)),
        );

        if (known) {
          interactions.push({
            drugA: input.medicines[i],
            drugB: input.medicines[j],
            severity: known.severity,
            description: known.description,
          });
        }
      }
    }

    return { interactions, provenance: provenance(0.85) };
  }

  async detectDuplicates(input: { records: { id: string; title: string; occurredAt?: string }[] }): Promise<DuplicateResult> {
    const groups = new Map<string, string[]>();

    for (const record of input.records) {
      const key = `${record.title.toLowerCase().replace(/\s+/g, " ").trim()}|${record.occurredAt?.slice(0, 10) ?? ""}`;
      groups.set(key, [...(groups.get(key) ?? []), record.id]);
    }

    const duplicates = [...groups.values()]
      .filter((ids) => ids.length > 1)
      .map((recordIds) => ({
        recordIds,
        reason: "Identical title on the same date.",
        confidence: 0.9,
      }));

    return { duplicates, provenance: provenance(0.9) };
  }
}
