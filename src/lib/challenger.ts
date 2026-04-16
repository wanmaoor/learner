import { callGemini, getModelVersion } from "./gemini";
import { challengerOutputSchema, type ChallengerOutput } from "./schemas";
import {
  DIAGNOSE_SYSTEM_PROMPT,
  CHALLENGE_SYSTEM_PROMPT,
  buildChallengerUserPrompt,
} from "./prompts";
import type { StudentSnapshot } from "./context";

export async function generateQuestion(options: {
  mode: "diagnose" | "challenge";
  module?: string;
  snapshot?: StudentSnapshot;
  existingTopics?: string[];
  recentTurns?: Array<{ role: string; content: string }>;
}): Promise<ChallengerOutput & { modelVersion: string }> {
  const systemPrompt =
    options.mode === "diagnose"
      ? DIAGNOSE_SYSTEM_PROMPT
      : CHALLENGE_SYSTEM_PROMPT;

  const userPrompt = buildChallengerUserPrompt({
    mode: options.mode,
    module: options.module,
    snapshot: options.snapshot,
    existingTopics: options.existingTopics,
    recentTurns: options.recentTurns,
  });

  const result = await callGemini({
    systemPrompt,
    userPrompt,
    schema: challengerOutputSchema,
  });

  return {
    ...result,
    modelVersion: getModelVersion(),
  };
}
