/**
 * The ONLY AI surface feature code is allowed to touch. Vendor SDKs live behind
 * adapters in this folder — never import Gemini/Groq/Tesseract from a module.
 */

/** Where a piece of AI-derived data came from, so the UI can show confidence and let a user correct it. */
export interface Provenance {
  /** Storage key of the source upload, when the data came from a document. */
  sourceUploadKey?: string;
  provider: string;
  model: string;
  /** 0..1 — below `LOW_CONFIDENCE_THRESHOLD` the UI must ask a human to confirm. */
  confidence: number;
}

export const LOW_CONFIDENCE_THRESHOLD = 0.7;

export interface OcrResult {
  text: string;
  /** Per-page text when the source was a multi-page PDF. */
  pages?: string[];
  provenance: Provenance;
}

export interface ExtractedMedicine {
  name: string;
  dose?: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
  confidence: number;
}

export interface ExtractMedicinesResult {
  medicines: ExtractedMedicine[];
  provenance: Provenance;
}

export interface ReportFinding {
  label: string;
  value: string;
  unit?: string;
  referenceRange?: string;
  flag: "NORMAL" | "LOW" | "HIGH" | "CRITICAL" | "UNKNOWN";
}

export interface AnalyzeReportResult {
  reportType?: string;
  findings: ReportFinding[];
  /** Plain-language explanation for the patient. Never a diagnosis. */
  plainSummary: string;
  provenance: Provenance;
}

export interface SummarizeResult {
  summary: string;
  provenance: Provenance;
}

export type InteractionSeverity = "NONE" | "MINOR" | "MODERATE" | "MAJOR" | "CONTRAINDICATED";

export interface DrugInteraction {
  drugA: string;
  drugB: string;
  severity: InteractionSeverity;
  description: string;
}

export interface DrugInteractionResult {
  interactions: DrugInteraction[];
  provenance: Provenance;
}

export interface DuplicateCandidate {
  /** Ids of records the caller passed in that look like the same real-world item. */
  recordIds: string[];
  reason: string;
  confidence: number;
}

export interface DuplicateResult {
  duplicates: DuplicateCandidate[];
  provenance: Provenance;
}

export interface DuplicateInput {
  id: string;
  title: string;
  occurredAt?: string;
  amount?: number;
}

export interface AiService {
  ocr(input: { buffer?: Uint8Array; url?: string; mimeType: string; sourceKey?: string }): Promise<OcrResult>;
  extractMedicines(input: { text: string; sourceKey?: string }): Promise<ExtractMedicinesResult>;
  analyzeReport(input: { text: string; sourceKey?: string }): Promise<AnalyzeReportResult>;
  summarize(input: { text: string; maxWords?: number }): Promise<SummarizeResult>;
  detectDrugInteractions(input: { medicines: string[] }): Promise<DrugInteractionResult>;
  detectDuplicates(input: { records: DuplicateInput[] }): Promise<DuplicateResult>;
}
