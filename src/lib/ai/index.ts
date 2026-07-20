import { MockAiService } from "@/lib/ai/mock";
import type { AiService } from "@/lib/ai/types";
import { env } from "@/lib/env";

/**
 * Adapter selection. `AI_PROVIDER=mock` (the default) keeps dev and CI free and
 * deterministic; the free-tier Gemini/Groq adapters land in Phase 4.
 */

let instance: AiService | null = null;

export function getAiService(): AiService {
  if (!instance) {
    switch (env.AI_PROVIDER) {
      case "gemini":
      case "groq":
        throw new Error(
          `AI_PROVIDER="${env.AI_PROVIDER}" has no adapter yet — it is built in Phase 4. ` +
            `Use AI_PROVIDER=mock until then.`,
        );
      case "mock":
      default:
        instance = new MockAiService();
    }
  }

  return instance;
}

/** Test seam: lets a suite inject a fake without touching env. */
export function setAiService(service: AiService | null): void {
  instance = service;
}

export type * from "@/lib/ai/types";
