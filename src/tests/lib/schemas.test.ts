import { describe, it, expect } from "vitest";
import {
  challengerOutputSchema,
  graderOutputSchema,
} from "@/lib/schemas";

describe("Challenger output schema", () => {
  it("accepts valid output", () => {
    const valid = {
      topic: "导数.复合函数求导",
      question_text: "求 f(x) = sin(x^2) 的导数",
      canonical_answer: "f'(x) = 2x*cos(x^2)",
      solution_steps: ["识别内外层", "链式法则"],
      difficulty: "medium",
      targeting_boundary: "链式法则遗漏内层导数",
    };
    expect(() => challengerOutputSchema.parse(valid)).not.toThrow();
  });

  it("rejects missing topic", () => {
    const invalid = {
      question_text: "求导",
      canonical_answer: "2x",
      solution_steps: [],
      difficulty: "easy",
    };
    expect(() => challengerOutputSchema.parse(invalid)).toThrow();
  });

  it("strips extra fields", () => {
    const withExtra = {
      topic: "函数",
      question_text: "问题",
      canonical_answer: "答案",
      solution_steps: ["步骤1"],
      difficulty: "easy",
      targeting_boundary: null,
      extra_field: "should be stripped",
    };
    const result = challengerOutputSchema.parse(withExtra);
    expect(result).not.toHaveProperty("extra_field");
  });
});

describe("Grader output schema", () => {
  it("accepts valid incorrect answer grading", () => {
    const valid = {
      is_correct: false,
      boundary_text: "遗漏内层导数",
      matches_existing_boundary: true,
      matched_boundary_id: "some-uuid",
      explanation: "你忘记了内层函数的导数",
      sm2_quality: 0,
    };
    expect(() => graderOutputSchema.parse(valid)).not.toThrow();
  });

  it("accepts valid correct answer grading", () => {
    const valid = {
      is_correct: true,
      boundary_text: null,
      matches_existing_boundary: false,
      matched_boundary_id: null,
      explanation: "回答正确",
      sm2_quality: 4,
    };
    expect(() => graderOutputSchema.parse(valid)).not.toThrow();
  });

  it("rejects sm2_quality > 5", () => {
    const invalid = {
      is_correct: true,
      boundary_text: null,
      matches_existing_boundary: false,
      matched_boundary_id: null,
      explanation: "正确",
      sm2_quality: 6,
    };
    expect(() => graderOutputSchema.parse(invalid)).toThrow();
  });
});
