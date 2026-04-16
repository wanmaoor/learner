import { callGemini } from "./gemini";
import { graderOutputSchema, type GraderOutput } from "./schemas";
import { GRADE_SYSTEM_PROMPT, buildGraderUserPrompt } from "./prompts";

export async function gradeAnswer(options: {
  questionText: string;
  canonicalAnswer: string;
  solutionSteps: string[];
  studentAnswer: string;
  existingBoundaries: Array<{ id: string; text: string }>;
}): Promise<GraderOutput> {
  const userPrompt = buildGraderUserPrompt(options);

  return callGemini({
    systemPrompt: GRADE_SYSTEM_PROMPT,
    userPrompt,
    schema: graderOutputSchema,
  });
}
