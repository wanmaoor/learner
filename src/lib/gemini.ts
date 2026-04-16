import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";

const genAI = new GoogleGenerativeAI(
  process.env.GOOGLE_GENERATIVE_AI_API_KEY!
);

const MODEL_NAME = "gemini-2.0-flash";

export class GeminiError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = "GeminiError";
  }
}

export async function callGemini<T>(options: {
  systemPrompt: string;
  userPrompt: string;
  schema: z.ZodSchema<T>;
  maxRetries?: number;
}): Promise<T> {
  const { systemPrompt, userPrompt, schema, maxRetries = 2 } = options;

  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction: systemPrompt,
    generationConfig: {
      responseMimeType: "application/json",
    },
  });

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        // 指数退避: 1s, 2s
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }

      const result = await model.generateContent(userPrompt);
      const text = result.response.text();

      // 解析 JSON
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new GeminiError("Invalid JSON response", "PARSE_ERROR");
      }

      // Schema 验证
      return schema.parse(parsed);
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error));

      const message = lastError.message.toLowerCase();
      if (message.includes("429") || message.includes("rate")) {
        continue;
      }
      if (message.includes("500") || message.includes("internal")) {
        continue;
      }
      if (
        lastError instanceof GeminiError &&
        lastError.code === "PARSE_ERROR"
      ) {
        continue;
      }
      if (lastError instanceof z.ZodError) {
        continue;
      }
      // 其他错误不重试
      throw lastError;
    }
  }

  throw lastError ?? new GeminiError("Max retries exceeded", "MAX_RETRIES");
}

export function getModelVersion(): string {
  return MODEL_NAME;
}
