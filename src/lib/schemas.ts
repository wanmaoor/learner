import { z } from "zod";

export const challengerOutputSchema = z
  .object({
    topic: z.string().min(1),
    question_text: z.string().min(1),
    canonical_answer: z.string().min(1),
    solution_steps: z.array(z.string()),
    difficulty: z.enum(["easy", "medium", "hard"]),
    targeting_boundary: z.string().nullable().optional(),
  })
  .strip();

export const graderOutputSchema = z
  .object({
    is_correct: z.boolean(),
    boundary_text: z.string().nullable(),
    matches_existing_boundary: z.boolean(),
    matched_boundary_id: z.string().nullable(),
    explanation: z.string().min(1),
    sm2_quality: z.number().int().min(0).max(5),
  })
  .strip();

export type ChallengerOutput = z.infer<typeof challengerOutputSchema>;
export type GraderOutput = z.infer<typeof graderOutputSchema>;
