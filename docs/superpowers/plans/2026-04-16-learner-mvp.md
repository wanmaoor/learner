# Learner MVP 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个 AI 驱动的高中数学学习 app，能精确检测学生知识边界并针对性出题攻击弱点

**Architecture:** Next.js 全栈单体架构。单个 Challenger Agent 通过 Gemini API 实现两步调用（出题 + 评分）。Neon Postgres 存储用户数据、掌握度记录和题目审计日志。SM-2 算法管理间隔重复。

**Tech Stack:** Next.js 15 (App Router) / TypeScript / Neon Postgres / Drizzle ORM / NextAuth.js / Google Generative AI SDK (@google/generative-ai) / KaTeX / Zod / Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-04-15-learner-mvp-v2-design.md`

---

## 文件结构

```
src/
├── app/
│   ├── layout.tsx                    # 根布局，加载 KaTeX CSS
│   ├── page.tsx                      # 首页/仪表盘
│   ├── login/page.tsx                # 登录页
│   ├── diagnose/page.tsx             # 冷启动诊断页
│   ├── learn/page.tsx                # 核心学习页
│   ├── progress/page.tsx             # 进度页
│   └── api/
│       ├── auth/[...nextauth]/route.ts
│       ├── diagnose/route.ts         # POST: 冷启动出题/评分
│       ├── challenge/route.ts        # POST: 学习出题/评分
│       ├── review/route.ts           # GET: 复习队列
│       └── feedback/route.ts         # POST: 用户反馈
├── lib/
│   ├── gemini.ts                     # Gemini API 客户端（重试、schema 验证）
│   ├── schemas.ts                    # Zod schema（Challenger/Grader 输出）
│   ├── challenger.ts                 # 出题逻辑 + prompt 组装
│   ├── grader.ts                     # 评分逻辑 + 边界诊断
│   ├── sm2.ts                        # SM-2 算法（纯函数）
│   ├── context.ts                    # student_snapshot 组装
│   ├── prompts.ts                    # 所有 system prompt 模板
│   └── auth.ts                       # NextAuth 配置
├── db/
│   ├── schema.ts                     # Drizzle schema 定义
│   ├── index.ts                      # DB 连接
│   └── migrate.ts                    # 迁移运行器
├── components/
│   ├── QuestionCard.tsx              # 题目展示（KaTeX）
│   ├── AnswerInput.tsx               # 答题输入框
│   ├── ExplanationPanel.tsx          # 解析展示（KaTeX）
│   ├── MasteryMap.tsx                # 掌握度可视化
│   ├── ReviewBadge.tsx               # 复习到期提示
│   └── LoadingSpinner.tsx            # 加载状态
└── tests/
    ├── lib/
    │   ├── sm2.test.ts
    │   ├── schemas.test.ts
    │   ├── context.test.ts
    │   ├── challenger.test.ts
    │   └── grader.test.ts
    └── eval/
        └── gemini-eval.ts            # Gemini 边界检测 eval 脚本
```

---

## Task 0: Gemini Eval（开发前门槛）

**目的：** 在写任何产品代码之前，确认 Gemini 的边界检测能力不低于 70%

**Files:**
- Create: `tests/eval/gemini-eval.ts`
- Read: `validation/test-cases.json`

- [ ] **Step 1: 安装 Gemini CLI**

```bash
npm install -g @google/gemini-cli
```

验证安装：
```bash
gemini --version
```

- [ ] **Step 2: 创建 eval 脚本**

```typescript
// tests/eval/gemini-eval.ts
import { readFileSync } from "fs";
import { GoogleGenerativeAI } from "@google/generative-ai";

const testCases = JSON.parse(
  readFileSync("validation/test-cases.json", "utf-8")
);

// 使用环境变量或 Gemini CLI 的认证
// 如果没有 API key，可以用 `gemini` CLI 手动跑每个 case
const BOUNDARY_DETECTION_PROMPT = `你是一个高中数学错题分析专家。

给定一道数学题、学生的答案和正确答案，请分析学生的具体失败模式。

不要只说"答错了"。要精确描述学生在哪个具体条件下出错。

如果学生答对了，回复 "已掌握"。

题目：{question}
学生答案：{student_answer}
正确答案：{correct_answer}

请用一句话描述学生的具体失败模式（或"已掌握"）：`;

async function runPartA() {
  console.log("=== Part A: 边界识别 ===\n");
  let correct = 0;
  const total = testCases.test_part_a.cases.length;

  for (const c of testCases.test_part_a.cases) {
    const prompt = BOUNDARY_DETECTION_PROMPT
      .replace("{question}", c.question)
      .replace("{student_answer}", c.student_answer)
      .replace("{correct_answer}", c.correct_answer);

    // 手动模式：打印 prompt 让用户粘贴到 Gemini CLI
    console.log(`--- Case ${c.id}: ${c.topic} ---`);
    console.log(`题目: ${c.question}`);
    console.log(`学生答案: ${c.student_answer}`);
    console.log(`正确答案: ${c.correct_answer}`);
    console.log(`预期边界: ${c.expected_boundary ?? "已掌握"}`);
    console.log(`\n请将以下 prompt 粘贴到 Gemini CLI：`);
    console.log(`---PROMPT START---`);
    console.log(prompt);
    console.log(`---PROMPT END---\n`);
    console.log(`Gemini 的回答是否匹配预期？(y/n): `);
    // 在实际运行中，等待用户输入
    console.log("");
  }

  console.log(`\n结果: ${correct}/${total}`);
  console.log(`通过标准: >= ${Math.ceil(total * 0.7)}/${total} (70%)`);
}

runPartA();
```

- [ ] **Step 3: 用 Gemini CLI 手动跑 Part A 的 20 个 case**

对每个 case，在终端中运行：
```bash
echo "你是一个高中数学错题分析专家。给定一道数学题、学生的答案和正确答案，请分析学生的具体失败模式。题目：求 f(x) = sin(x²) 的导数。学生答案：f'(x) = cos(x²)。正确答案：f'(x) = 2x·cos(x²)。请用一句话描述学生的具体失败模式：" | gemini
```

记录每个 case 的结果到 `validation/gemini-eval-results.md`。

- [ ] **Step 4: 用 Gemini CLI 跑 Part B 的 10 个边界匹配 case**

对每对错误，问 Gemini：
```
这两个学生错误是否代表相同的失败模式？
错误A: {error_a}
错误B: {error_b}
回答 SAME 或 DIFFERENT，并简要说明理由。
```

- [ ] **Step 5: 评估结果**

- Part A >= 14/20 (70%) → PASS
- Part B >= 7/10 (70%) → PASS
- 两项都 PASS → 继续开发
- 任一项 FAIL → 调整 prompt 重试，或考虑换模型

- [ ] **Step 6: 提交结果**

```bash
git add validation/gemini-eval-results.md tests/eval/
git commit -m "eval: gemini boundary detection validation results"
```

---

## Task 1: 项目初始化

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `.env.local.example`, `drizzle.config.ts`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`

- [ ] **Step 1: 创建 Next.js 项目**

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --turbopack
```

- [ ] **Step 2: 安装依赖**

```bash
npm install drizzle-orm @neondatabase/serverless next-auth@beta @auth/drizzle-adapter zod katex @google/generative-ai
npm install -D drizzle-kit @types/katex vitest
```

- [ ] **Step 3: 创建环境变量模板**

```bash
# .env.local.example
DATABASE_URL=postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/learner?sslmode=require
NEXTAUTH_SECRET=your-random-secret-here
NEXTAUTH_URL=http://localhost:3000
GOOGLE_GENERATIVE_AI_API_KEY=your-gemini-api-key
```

- [ ] **Step 4: 配置 Vitest**

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

在 `package.json` 的 scripts 中添加：
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 5: 验证项目启动**

```bash
npm run dev
```

打开 http://localhost:3000，确认看到 Next.js 默认页面。

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "init: next.js project with deps"
```

---

## Task 2: 数据库 Schema

**Files:**
- Create: `src/db/schema.ts`
- Create: `src/db/index.ts`
- Create: `drizzle.config.ts`

- [ ] **Step 1: 定义 Drizzle schema**

```typescript
// src/db/schema.ts
import {
  pgTable,
  uuid,
  text,
  real,
  integer,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),
    sessionType: text("session_type").notNull(), // 'diagnose' | 'challenge' | 'review'
    topic: text("topic"),
    status: text("status").default("active").notNull(), // 'active' | 'completed' | 'abandoned'
    currentQuestionIndex: integer("current_question_index").default(0),
    summary: text("summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [index("idx_sessions_user_status").on(table.userId, table.status)]
);

export const masteryRecords = pgTable(
  "mastery_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),
    topic: text("topic").notNull(),
    accuracy: real("accuracy").default(0),
    attempts: integer("attempts").default(0),
    successes: integer("successes").default(0),
    sm2Interval: real("sm2_interval").default(1),
    sm2Easiness: real("sm2_easiness").default(2.5),
    sm2Repetitions: integer("sm2_repetitions").default(0),
    nextReview: timestamp("next_review", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_mastery_user_topic").on(table.userId, table.topic),
    index("idx_mastery_user").on(table.userId),
  ]
);

export const boundaries = pgTable(
  "boundaries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    masteryId: uuid("mastery_id")
      .references(() => masteryRecords.id)
      .notNull(),
    boundaryText: text("boundary_text").notNull(),
    confirmed: boolean("confirmed").default(false),
    attempts: integer("attempts").default(0),
    successes: integer("successes").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [index("idx_boundaries_mastery").on(table.masteryId)]
);

export const questions = pgTable(
  "questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .references(() => sessions.id)
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),
    topic: text("topic").notNull(),
    questionText: text("question_text").notNull(),
    canonicalAnswer: text("canonical_answer").notNull(),
    solutionSteps: jsonb("solution_steps").$type<string[]>(),
    studentAnswer: text("student_answer"),
    isCorrect: boolean("is_correct"),
    boundaryDetected: text("boundary_detected"),
    gradingRationale: text("grading_rationale"),
    modelVersion: text("model_version"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_questions_session").on(table.sessionId),
    index("idx_questions_user_date").on(table.userId, table.createdAt),
  ]
);

export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id),
    eventType: text("event_type").notNull(),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_analytics_type_date").on(table.eventType, table.createdAt),
  ]
);
```

- [ ] **Step 2: 创建数据库连接**

```typescript
// src/db/index.ts
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });
```

- [ ] **Step 3: 配置 Drizzle Kit**

```typescript
// drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

- [ ] **Step 4: 生成并运行迁移**

```bash
npx drizzle-kit generate
npx drizzle-kit push
```

- [ ] **Step 5: 提交**

```bash
git add src/db/ drizzle.config.ts drizzle/
git commit -m "feat: database schema with drizzle orm"
```

---

## Task 3: SM-2 算法（TDD）

**Files:**
- Create: `src/lib/sm2.ts`
- Create: `src/tests/lib/sm2.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// src/tests/lib/sm2.test.ts
import { describe, it, expect } from "vitest";
import { calculateSm2 } from "@/lib/sm2";

describe("SM-2 algorithm", () => {
  it("quality 5 (perfect) increases interval", () => {
    const result = calculateSm2({
      quality: 5,
      repetitions: 1,
      easiness: 2.5,
      interval: 1,
    });
    expect(result.interval).toBe(6);
    expect(result.repetitions).toBe(2);
    expect(result.easiness).toBeCloseTo(2.6, 1);
  });

  it("quality 0 (fail) resets interval to 1", () => {
    const result = calculateSm2({
      quality: 0,
      repetitions: 5,
      easiness: 2.5,
      interval: 30,
    });
    expect(result.interval).toBe(1);
    expect(result.repetitions).toBe(0);
  });

  it("easiness never goes below 1.3", () => {
    const result = calculateSm2({
      quality: 0,
      repetitions: 0,
      easiness: 1.3,
      interval: 1,
    });
    expect(result.easiness).toBeGreaterThanOrEqual(1.3);
  });

  it("first correct answer sets interval to 1", () => {
    const result = calculateSm2({
      quality: 4,
      repetitions: 0,
      easiness: 2.5,
      interval: 1,
    });
    expect(result.interval).toBe(1);
    expect(result.repetitions).toBe(1);
  });

  it("second correct answer sets interval to 6", () => {
    const result = calculateSm2({
      quality: 4,
      repetitions: 1,
      easiness: 2.5,
      interval: 1,
    });
    expect(result.interval).toBe(6);
    expect(result.repetitions).toBe(2);
  });

  it("third+ correct answer multiplies by easiness", () => {
    const result = calculateSm2({
      quality: 4,
      repetitions: 2,
      easiness: 2.5,
      interval: 6,
    });
    expect(result.interval).toBeCloseTo(15, 0);
    expect(result.repetitions).toBe(3);
  });

  it("handles NaN easiness by resetting to default", () => {
    const result = calculateSm2({
      quality: 4,
      repetitions: 0,
      easiness: NaN,
      interval: 1,
    });
    expect(result.easiness).toBe(2.5);
    expect(Number.isNaN(result.easiness)).toBe(false);
  });

  it("handles Infinity interval by resetting to 1", () => {
    const result = calculateSm2({
      quality: 4,
      repetitions: 0,
      easiness: 2.5,
      interval: Infinity,
    });
    expect(Number.isFinite(result.interval)).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run src/tests/lib/sm2.test.ts
```

预期：FAIL，"Cannot find module '@/lib/sm2'"

- [ ] **Step 3: 实现 SM-2**

```typescript
// src/lib/sm2.ts
export interface Sm2Input {
  quality: number; // 0-5
  repetitions: number;
  easiness: number;
  interval: number; // days
}

export interface Sm2Output {
  repetitions: number;
  easiness: number;
  interval: number; // days
  nextReview: Date;
}

export function calculateSm2(input: Sm2Input): Sm2Output {
  let { quality, repetitions, easiness, interval } = input;

  // 防御 NaN/Infinity
  if (!Number.isFinite(easiness)) easiness = 2.5;
  if (!Number.isFinite(interval) || interval < 1) interval = 1;
  quality = Math.max(0, Math.min(5, Math.round(quality)));

  let newRepetitions: number;
  let newInterval: number;
  let newEasiness: number;

  if (quality >= 3) {
    // 正确回答
    if (repetitions === 0) {
      newInterval = 1;
    } else if (repetitions === 1) {
      newInterval = 6;
    } else {
      newInterval = Math.round(interval * easiness);
    }
    newRepetitions = repetitions + 1;
  } else {
    // 错误回答
    newInterval = 1;
    newRepetitions = 0;
  }

  // 更新 easiness factor
  newEasiness =
    easiness + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));

  // easiness 下限 1.3
  if (newEasiness < 1.3) newEasiness = 1.3;

  // 计算下次复习日期
  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + newInterval);

  return {
    repetitions: newRepetitions,
    easiness: newEasiness,
    interval: newInterval,
    nextReview,
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run src/tests/lib/sm2.test.ts
```

预期：全部 PASS

- [ ] **Step 5: 提交**

```bash
git add src/lib/sm2.ts src/tests/lib/sm2.test.ts
git commit -m "feat: SM-2 spaced repetition algorithm with tests"
```

---

## Task 4: Zod Schema + Gemini 客户端

**Files:**
- Create: `src/lib/schemas.ts`
- Create: `src/lib/gemini.ts`
- Create: `src/tests/lib/schemas.test.ts`

- [ ] **Step 1: 写 schema 测试**

```typescript
// src/tests/lib/schemas.test.ts
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
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run src/tests/lib/schemas.test.ts
```

- [ ] **Step 3: 实现 schemas**

```typescript
// src/lib/schemas.ts
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
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run src/tests/lib/schemas.test.ts
```

- [ ] **Step 5: 实现 Gemini 客户端**

```typescript
// src/lib/gemini.ts
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
        // 限流，等待后重试
        continue;
      }
      if (message.includes("500") || message.includes("internal")) {
        // 服务端错误，重试
        continue;
      }
      if (
        lastError instanceof GeminiError &&
        lastError.code === "PARSE_ERROR"
      ) {
        // 格式错误，重试
        continue;
      }
      if (lastError instanceof z.ZodError) {
        // Schema 验证失败，重试
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
```

- [ ] **Step 6: 提交**

```bash
git add src/lib/schemas.ts src/lib/gemini.ts src/tests/lib/schemas.test.ts
git commit -m "feat: zod schemas + gemini client with retry logic"
```

---

## Task 5: Prompt 模板 + Challenger + Grader

**Files:**
- Create: `src/lib/prompts.ts`
- Create: `src/lib/challenger.ts`
- Create: `src/lib/grader.ts`
- Create: `src/lib/context.ts`
- Create: `src/tests/lib/context.test.ts`

- [ ] **Step 1: 创建 prompt 模板**

```typescript
// src/lib/prompts.ts
export const DIAGNOSE_SYSTEM_PROMPT = `你是一个高中数学诊断系统。你的任务是出一道中等难度的数学题来测试学生在指定模块下的基础能力。

你必须返回一个 JSON 对象，格式如下：
{
  "topic": "模块名.具体知识点",
  "question_text": "题目文本（可包含 LaTeX，用 $...$ 包裹）",
  "canonical_answer": "标准答案（可包含 LaTeX）",
  "solution_steps": ["步骤1", "步骤2", ...],
  "difficulty": "medium",
  "targeting_boundary": null
}

注意：
- topic 必须是 "模块名.具体知识点" 格式
- question_text 必须是一道完整的数学题
- canonical_answer 必须是精确的答案
- solution_steps 必须包含完整的解题步骤
- 只返回 JSON，不要返回其他文本`;

export const CHALLENGE_SYSTEM_PROMPT = `你是一个高中数学挑战系统。你的任务是根据学生的学情快照，针对他们最薄弱的知识点出题。

你必须返回一个 JSON 对象，格式如下：
{
  "topic": "从已有 topics 列表中选择一个，或创建新的",
  "question_text": "针对学生弱点设计的题目",
  "canonical_answer": "标准答案",
  "solution_steps": ["步骤1", "步骤2", ...],
  "difficulty": "easy|medium|hard",
  "targeting_boundary": "针对的具体边界（如果有的话）"
}

出题策略：
- 如果学生在某个边界反复犯错，换角度出题测试同一个边界
- 如果学生连续答对，提高难度或换情境
- 优先从已有的 topics 列表中选择 topic
- 每道题必须有唯一的正确答案
- 只返回 JSON，不要返回其他文本`;

export const GRADE_SYSTEM_PROMPT = `你是一个高中数学评分系统。你的任务是对比学生的答案和标准答案，判断对错并诊断失败模式。

你必须返回一个 JSON 对象，格式如下：
{
  "is_correct": true/false,
  "boundary_text": "具体的失败模式描述（答对时为 null）",
  "matches_existing_boundary": true/false,
  "matched_boundary_id": "匹配的边界 ID（没有匹配时为 null）",
  "explanation": "给学生的解析（2-3 步，简洁明了，可包含 LaTeX）",
  "sm2_quality": 0-5
}

评分规则：
- 答案正确：is_correct=true, boundary_text=null, sm2_quality=4
- 答案错误：is_correct=false, boundary_text 必须描述具体失败模式, sm2_quality=0
- boundary_text 不是"答错了"，而是"具体在什么条件下出错"
- 如果提供了已知边界列表，检查学生的错误是否匹配其中某个
- explanation 用中文，数学公式用 LaTeX（$...$）
- 只返回 JSON，不要返回其他文本`;

export function buildChallengerUserPrompt(options: {
  mode: "diagnose" | "challenge";
  module?: string; // diagnose 模式下的模块名
  snapshot?: object; // challenge 模式下的学情快照
  existingTopics?: string[];
  recentTurns?: object[];
}): string {
  if (options.mode === "diagnose") {
    return `请为"${options.module}"模块出一道中等难度的诊断题。`;
  }

  return `学情快照：
${JSON.stringify(options.snapshot, null, 2)}

已有 topics 列表（优先使用这些，不要创建新的除非确实是新知识点）：
${(options.existingTopics ?? []).join("\n")}

最近对话：
${JSON.stringify(options.recentTurns ?? [], null, 2)}

请根据学情快照，针对最薄弱的知识点出一道题。`;
}

export function buildGraderUserPrompt(options: {
  questionText: string;
  canonicalAnswer: string;
  solutionSteps: string[];
  studentAnswer: string;
  existingBoundaries: Array<{ id: string; text: string }>;
}): string {
  return `题目：${options.questionText}

标准答案：${options.canonicalAnswer}

解题步骤：
${options.solutionSteps.map((s, i) => `${i + 1}. ${s}`).join("\n")}

学生答案：${options.studentAnswer}

该 topic 已知的边界列表（如果学生的错误匹配其中某个，设 matches_existing_boundary=true 并填写 matched_boundary_id）：
${options.existingBoundaries.map((b) => `- ID: ${b.id}, 描述: ${b.text}`).join("\n") || "（暂无已知边界）"}

请评分并诊断。`;
}
```

- [ ] **Step 2: 写 context 测试**

```typescript
// src/tests/lib/context.test.ts
import { describe, it, expect } from "vitest";
import { buildStudentSnapshot } from "@/lib/context";

describe("buildStudentSnapshot", () => {
  it("builds snapshot from mastery records and boundaries", () => {
    const masteryRecords = [
      {
        topic: "导数.复合函数求导",
        accuracy: 0.2,
        sm2Interval: 1,
        nextReview: new Date("2026-04-16"),
      },
    ];
    const boundaries = [
      {
        masteryTopic: "导数.复合函数求导",
        boundaryText: "遗漏内层导数",
        confirmed: true,
        attempts: 4,
      },
    ];

    const snapshot = buildStudentSnapshot(masteryRecords, boundaries);

    expect(snapshot.mastery_map["导数.复合函数求导"]).toBeDefined();
    expect(snapshot.mastery_map["导数.复合函数求导"].accuracy).toBe(0.2);
    expect(
      snapshot.mastery_map["导数.复合函数求导"].boundaries
    ).toHaveLength(1);
  });

  it("truncates to top 20 weakest when > 20 topics", () => {
    const masteryRecords = Array.from({ length: 30 }, (_, i) => ({
      topic: `topic-${i}`,
      accuracy: i / 30, // 0.0 到 0.97
      sm2Interval: 1,
      nextReview: new Date(),
    }));

    const snapshot = buildStudentSnapshot(masteryRecords, []);
    const topicCount = Object.keys(snapshot.mastery_map).length;
    expect(topicCount).toBeLessThanOrEqual(20);
    // 应该保留 accuracy 最低的 20 个
    expect(snapshot.mastery_map["topic-0"]).toBeDefined();
  });

  it("handles empty data (new user)", () => {
    const snapshot = buildStudentSnapshot([], []);
    expect(Object.keys(snapshot.mastery_map)).toHaveLength(0);
    expect(snapshot.review_due).toHaveLength(0);
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

```bash
npx vitest run src/tests/lib/context.test.ts
```

- [ ] **Step 4: 实现 context.ts**

```typescript
// src/lib/context.ts
export interface StudentSnapshot {
  current_topic: string | null;
  mastery_map: Record<
    string,
    {
      accuracy: number;
      boundaries: Array<{
        text: string;
        confirmed: boolean;
        attempts: number;
      }>;
      sm2_interval: number;
      next_review: string | null;
    }
  >;
  review_due: string[];
}

interface MasteryInput {
  topic: string;
  accuracy: number | null;
  sm2Interval: number | null;
  nextReview: Date | null;
}

interface BoundaryInput {
  masteryTopic: string;
  boundaryText: string;
  confirmed: boolean | null;
  attempts: number | null;
}

const MAX_TOPICS_IN_SNAPSHOT = 20;

export function buildStudentSnapshot(
  masteryRecords: MasteryInput[],
  boundaries: BoundaryInput[]
): StudentSnapshot {
  // 按 accuracy 升序排列（最弱的在前）
  const sorted = [...masteryRecords].sort(
    (a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0)
  );

  // 截断到 top 20
  const truncated = sorted.slice(0, MAX_TOPICS_IN_SNAPSHOT);

  // 构建 mastery_map
  const masteryMap: StudentSnapshot["mastery_map"] = {};
  const now = new Date();
  const reviewDue: string[] = [];

  for (const record of truncated) {
    const topicBoundaries = boundaries
      .filter((b) => b.masteryTopic === record.topic)
      .map((b) => ({
        text: b.boundaryText,
        confirmed: b.confirmed ?? false,
        attempts: b.attempts ?? 0,
      }));

    masteryMap[record.topic] = {
      accuracy: record.accuracy ?? 0,
      boundaries: topicBoundaries,
      sm2_interval: record.sm2Interval ?? 1,
      next_review: record.nextReview?.toISOString() ?? null,
    };

    if (record.nextReview && record.nextReview <= now) {
      reviewDue.push(record.topic);
    }
  }

  // current_topic: 最弱的 topic
  const currentTopic = truncated.length > 0 ? truncated[0].topic : null;

  return {
    current_topic: currentTopic,
    mastery_map: masteryMap,
    review_due: reviewDue,
  };
}
```

- [ ] **Step 5: 运行测试确认通过**

```bash
npx vitest run src/tests/lib/context.test.ts
```

- [ ] **Step 6: 实现 challenger.ts**

```typescript
// src/lib/challenger.ts
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
```

- [ ] **Step 7: 实现 grader.ts**

```typescript
// src/lib/grader.ts
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
```

- [ ] **Step 8: 提交**

```bash
git add src/lib/prompts.ts src/lib/challenger.ts src/lib/grader.ts src/lib/context.ts src/tests/lib/context.test.ts
git commit -m "feat: challenger + grader + context assembly + prompts"
```

---

## Task 6: NextAuth 认证

**Files:**
- Create: `src/lib/auth.ts`
- Create: `src/app/api/auth/[...nextauth]/route.ts`
- Create: `src/app/login/page.tsx`

- [ ] **Step 1: 配置 NextAuth**

```typescript
// src/lib/auth.ts
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = credentials.email as string;
        const password = credentials.password as string;

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (!user) {
          // 注册新用户
          const passwordHash = await bcrypt.hash(password, 10);
          const [newUser] = await db
            .insert(users)
            .values({ email, passwordHash })
            .returning();
          return { id: newUser.id, email: newUser.email };
        }

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, email: user.email };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.userId) {
        session.user.id = token.userId as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
```

- [ ] **Step 2: 创建 API 路由**

```typescript
// src/app/api/auth/[...nextauth]/route.ts
import { handlers } from "@/lib/auth";
export const { GET, POST } = handlers;
```

- [ ] **Step 3: 安装 bcryptjs**

```bash
npm install bcryptjs
npm install -D @types/bcryptjs
```

- [ ] **Step 4: 创建登录页**

```tsx
// src/app/login/page.tsx
"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("邮箱或密码错误");
    } else {
      router.push("/");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow">
        <h1 className="text-2xl font-bold text-center">Learner</h1>
        <p className="text-center text-gray-600">
          登录或注册（首次输入邮箱密码即注册）
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="邮箱"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <input
            type="password"
            placeholder="密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          />

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "处理中..." : "登录 / 注册"}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: 提交**

```bash
git add src/lib/auth.ts src/app/api/auth/ src/app/login/
git commit -m "feat: nextauth email/password auth with auto-register"
```

---

## Task 7: 核心 API 路由（/api/challenge）

**Files:**
- Create: `src/app/api/challenge/route.ts`
- Create: `src/app/api/diagnose/route.ts`
- Create: `src/app/api/review/route.ts`
- Create: `src/app/api/feedback/route.ts`

- [ ] **Step 1: 实现 /api/challenge**

```typescript
// src/app/api/challenge/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  sessions,
  questions,
  masteryRecords,
  boundaries,
  analyticsEvents,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { generateQuestion } from "@/lib/challenger";
import { gradeAnswer } from "@/lib/grader";
import { buildStudentSnapshot } from "@/lib/context";
import { calculateSm2 } from "@/lib/sm2";
import { getModelVersion } from "@/lib/gemini";

const MAX_QUESTIONS_PER_SESSION = 5;

function sanitizeInput(text: string): string {
  return text
    .replace(/<[^>]*>/g, "") // strip HTML tags
    .slice(0, 500); // max 500 chars
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const body = await request.json();
  const { action, sessionId, studentAnswer } = body;

  // action: "generate" (出题) 或 "answer" (评分)
  if (action === "generate") {
    // 获取或创建学习会话
    let learningSession;
    if (sessionId) {
      [learningSession] = await db
        .select()
        .from(sessions)
        .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
        .limit(1);
    }

    if (!learningSession || learningSession.status !== "active") {
      // 创建新会话
      [learningSession] = await db
        .insert(sessions)
        .values({
          userId,
          sessionType: "challenge",
          status: "active",
          currentQuestionIndex: 0,
        })
        .returning();
    }

    // 检查是否达到上限
    if (
      (learningSession.currentQuestionIndex ?? 0) >= MAX_QUESTIONS_PER_SESSION
    ) {
      await db
        .update(sessions)
        .set({ status: "completed" })
        .where(eq(sessions.id, learningSession.id));
      return NextResponse.json({ done: true, sessionId: learningSession.id });
    }

    // 组装学情快照
    const userMastery = await db
      .select()
      .from(masteryRecords)
      .where(eq(masteryRecords.userId, userId));

    const userBoundaries = await db
      .select({
        masteryTopic: masteryRecords.topic,
        boundaryText: boundaries.boundaryText,
        confirmed: boundaries.confirmed,
        attempts: boundaries.attempts,
      })
      .from(boundaries)
      .innerJoin(
        masteryRecords,
        eq(boundaries.masteryId, masteryRecords.id)
      )
      .where(eq(masteryRecords.userId, userId));

    const snapshot = buildStudentSnapshot(userMastery, userBoundaries);
    const existingTopics = userMastery.map((m) => m.topic);

    // 获取最近对话
    const recentQuestions = await db
      .select()
      .from(questions)
      .where(eq(questions.sessionId, learningSession.id))
      .orderBy(questions.createdAt);

    const recentTurns = recentQuestions.flatMap((q) => [
      { role: "assistant", content: q.questionText },
      ...(q.studentAnswer
        ? [
            {
              role: "user",
              content: q.studentAnswer,
            },
          ]
        : []),
    ]);

    // 出题
    const startTime = Date.now();
    const question = await generateQuestion({
      mode: "challenge",
      snapshot,
      existingTopics,
      recentTurns,
    });
    const latencyMs = Date.now() - startTime;

    // 保存题目到 DB
    const [savedQuestion] = await db
      .insert(questions)
      .values({
        sessionId: learningSession.id,
        userId,
        topic: question.topic,
        questionText: question.question_text,
        canonicalAnswer: question.canonical_answer,
        solutionSteps: question.solution_steps,
        modelVersion: question.modelVersion,
      })
      .returning();

    // 记录分析事件
    await db.insert(analyticsEvents).values({
      userId,
      eventType: "api_call",
      metadata: {
        type: "challenge",
        latency_ms: latencyMs,
        model: question.modelVersion,
      },
    });

    return NextResponse.json({
      sessionId: learningSession.id,
      questionId: savedQuestion.id,
      questionText: question.question_text,
      topic: question.topic,
      questionIndex: learningSession.currentQuestionIndex,
    });
  }

  if (action === "answer") {
    if (!studentAnswer || !sessionId) {
      return NextResponse.json(
        { error: "Missing studentAnswer or sessionId" },
        { status: 400 }
      );
    }

    const sanitized = sanitizeInput(studentAnswer);
    if (sanitized.length === 0) {
      return NextResponse.json(
        { error: "Answer cannot be empty" },
        { status: 400 }
      );
    }

    // 找到当前未评分的题目
    const [currentQuestion] = await db
      .select()
      .from(questions)
      .where(
        and(
          eq(questions.sessionId, sessionId),
          eq(questions.userId, userId)
        )
      )
      .orderBy(questions.createdAt)
      .then((qs) => qs.filter((q) => q.isCorrect === null).slice(0, 1));

    if (!currentQuestion) {
      return NextResponse.json(
        { error: "No pending question" },
        { status: 400 }
      );
    }

    // 获取该 topic 的已知边界
    const [mastery] = await db
      .select()
      .from(masteryRecords)
      .where(
        and(
          eq(masteryRecords.userId, userId),
          eq(masteryRecords.topic, currentQuestion.topic)
        )
      )
      .limit(1);

    let existingBoundaries: Array<{ id: string; text: string }> = [];
    if (mastery) {
      const bs = await db
        .select()
        .from(boundaries)
        .where(eq(boundaries.masteryId, mastery.id));
      existingBoundaries = bs.map((b) => ({
        id: b.id,
        text: b.boundaryText,
      }));
    }

    // 评分
    const startTime = Date.now();
    const gradeResult = await gradeAnswer({
      questionText: currentQuestion.questionText,
      canonicalAnswer: currentQuestion.canonicalAnswer,
      solutionSteps: (currentQuestion.solutionSteps as string[]) ?? [],
      studentAnswer: sanitized,
      existingBoundaries,
    });
    const latencyMs = Date.now() - startTime;

    // 更新题目记录
    await db
      .update(questions)
      .set({
        studentAnswer: sanitized,
        isCorrect: gradeResult.is_correct,
        boundaryDetected: gradeResult.boundary_text,
        gradingRationale: gradeResult.explanation,
      })
      .where(eq(questions.id, currentQuestion.id));

    // 更新 mastery_records
    if (!mastery) {
      // 新 topic
      const [newMastery] = await db
        .insert(masteryRecords)
        .values({
          userId,
          topic: currentQuestion.topic,
          accuracy: gradeResult.is_correct ? 1 : 0,
          attempts: 1,
          successes: gradeResult.is_correct ? 1 : 0,
        })
        .returning();

      if (gradeResult.boundary_text && !gradeResult.is_correct) {
        await db.insert(boundaries).values({
          masteryId: newMastery.id,
          boundaryText: gradeResult.boundary_text,
          attempts: 1,
        });
      }
    } else {
      // 更新已有 topic
      const newAttempts = (mastery.attempts ?? 0) + 1;
      const newSuccesses =
        (mastery.successes ?? 0) + (gradeResult.is_correct ? 1 : 0);

      const sm2Result = calculateSm2({
        quality: gradeResult.sm2_quality,
        repetitions: mastery.sm2Repetitions ?? 0,
        easiness: mastery.sm2Easiness ?? 2.5,
        interval: mastery.sm2Interval ?? 1,
      });

      await db
        .update(masteryRecords)
        .set({
          accuracy: newSuccesses / newAttempts,
          attempts: newAttempts,
          successes: newSuccesses,
          sm2Interval: sm2Result.interval,
          sm2Easiness: sm2Result.easiness,
          sm2Repetitions: sm2Result.repetitions,
          nextReview: sm2Result.nextReview,
          updatedAt: new Date(),
        })
        .where(eq(masteryRecords.id, mastery.id));

      // 更新或创建边界
      if (gradeResult.boundary_text && !gradeResult.is_correct) {
        if (
          gradeResult.matches_existing_boundary &&
          gradeResult.matched_boundary_id
        ) {
          // 更新已有边界
          const [existing] = await db
            .select()
            .from(boundaries)
            .where(eq(boundaries.id, gradeResult.matched_boundary_id))
            .limit(1);

          if (existing) {
            await db
              .update(boundaries)
              .set({
                attempts: (existing.attempts ?? 0) + 1,
                confirmed:
                  (existing.attempts ?? 0) + 1 >= 2 ? true : existing.confirmed,
              })
              .where(eq(boundaries.id, existing.id));
          }
        } else {
          // 创建新边界
          await db.insert(boundaries).values({
            masteryId: mastery.id,
            boundaryText: gradeResult.boundary_text,
            attempts: 1,
          });
        }
      }
    }

    // 更新会话进度
    const [currentSession] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    const newIndex = (currentSession?.currentQuestionIndex ?? 0) + 1;
    const isDone = newIndex >= MAX_QUESTIONS_PER_SESSION;

    await db
      .update(sessions)
      .set({
        currentQuestionIndex: newIndex,
        status: isDone ? "completed" : "active",
        topic: currentQuestion.topic,
      })
      .where(eq(sessions.id, sessionId));

    // 记录分析事件
    await db.insert(analyticsEvents).values({
      userId,
      eventType: "api_call",
      metadata: {
        type: "grade",
        latency_ms: latencyMs,
        is_correct: gradeResult.is_correct,
      },
    });

    return NextResponse.json({
      isCorrect: gradeResult.is_correct,
      boundaryText: gradeResult.boundary_text,
      explanation: gradeResult.explanation,
      done: isDone,
      questionIndex: newIndex,
    });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
```

- [ ] **Step 2: 实现 /api/diagnose**

```typescript
// src/app/api/diagnose/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { sessions, questions, masteryRecords, analyticsEvents } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { generateQuestion } from "@/lib/challenger";

const MODULES = ["函数", "导数", "三角函数", "概率统计", "立体几何"];

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const body = await request.json();
  const { action, sessionId, studentAnswer, moduleIndex } = body;

  if (action === "start") {
    // 检查是否已有诊断
    const existing = await db
      .select()
      .from(sessions)
      .where(
        and(eq(sessions.userId, userId), eq(sessions.sessionType, "diagnose"))
      )
      .limit(1);

    if (existing.length > 0 && existing[0].status === "completed") {
      return NextResponse.json({ alreadyDiagnosed: true });
    }

    // 创建诊断会话
    const [diagSession] = await db
      .insert(sessions)
      .values({
        userId,
        sessionType: "diagnose",
        status: "active",
        currentQuestionIndex: 0,
      })
      .returning();

    // 出第一题
    const question = await generateQuestion({
      mode: "diagnose",
      module: MODULES[0],
    });

    const [saved] = await db
      .insert(questions)
      .values({
        sessionId: diagSession.id,
        userId,
        topic: question.topic,
        questionText: question.question_text,
        canonicalAnswer: question.canonical_answer,
        solutionSteps: question.solution_steps,
        modelVersion: question.modelVersion,
      })
      .returning();

    return NextResponse.json({
      sessionId: diagSession.id,
      questionId: saved.id,
      questionText: question.question_text,
      topic: question.topic,
      moduleIndex: 0,
      moduleName: MODULES[0],
      totalModules: MODULES.length,
    });
  }

  // action === "answer" 的逻辑和 /api/challenge 类似，但完成后出下一个模块的题
  // 这里省略评分逻辑（复用 gradeAnswer），关键区别是：
  // 评分完成后，如果 moduleIndex < 4，出下一个模块的诊断题
  // 如果 moduleIndex === 4，标记诊断完成

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
```

- [ ] **Step 3: 实现 /api/review**

```typescript
// src/app/api/review/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { masteryRecords } from "@/db/schema";
import { eq, lte } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const dueItems = await db
    .select()
    .from(masteryRecords)
    .where(
      eq(masteryRecords.userId, session.user.id)
    )
    .then((records) =>
      records
        .filter((r) => r.nextReview && r.nextReview <= now)
        .sort(
          (a, b) =>
            (a.nextReview?.getTime() ?? 0) - (b.nextReview?.getTime() ?? 0)
        )
        .slice(0, 10)
    );

  return NextResponse.json({ reviewQueue: dueItems });
}
```

- [ ] **Step 4: 实现 /api/feedback**

```typescript
// src/app/api/feedback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { analyticsEvents } from "@/db/schema";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { questionId, feedbackType } = await request.json();

  await db.insert(analyticsEvents).values({
    userId: session.user.id,
    eventType: "feedback",
    metadata: { question_id: questionId, type: feedbackType },
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: 提交**

```bash
git add src/app/api/
git commit -m "feat: core API routes (challenge, diagnose, review, feedback)"
```

---

## Task 8: 核心学习 UI

**Files:**
- Create: `src/components/QuestionCard.tsx`
- Create: `src/components/AnswerInput.tsx`
- Create: `src/components/ExplanationPanel.tsx`
- Create: `src/components/LoadingSpinner.tsx`
- Create: `src/app/learn/page.tsx`
- Create: `src/app/page.tsx` (仪表盘)
- Create: `src/app/diagnose/page.tsx`

- [ ] **Step 1: 安装 KaTeX CSS**

在 `src/app/layout.tsx` 中添加 KaTeX CSS：

```tsx
// src/app/layout.tsx
import type { Metadata } from "next";
import "katex/dist/katex.min.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Learner - AI 数学学习",
  description: "精准检测知识边界，针对性突破弱点",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: 创建 LoadingSpinner**

```tsx
// src/components/LoadingSpinner.tsx
export default function LoadingSpinner({ text = "AI 思考中..." }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      <p className="text-gray-500 text-sm">{text}</p>
    </div>
  );
}
```

- [ ] **Step 3: 创建 QuestionCard**

```tsx
// src/components/QuestionCard.tsx
"use client";

import katex from "katex";

function renderMath(text: string): string {
  // 替换 $...$ 为渲染后的 HTML
  return text.replace(/\$(.+?)\$/g, (_, math) => {
    try {
      return katex.renderToString(math, { throwOnError: false });
    } catch {
      return math;
    }
  });
}

export default function QuestionCard({
  questionText,
  topic,
  questionIndex,
  totalQuestions,
}: {
  questionText: string;
  topic: string;
  questionIndex: number;
  totalQuestions: number;
}) {
  return (
    <div className="bg-white rounded-lg shadow-md p-6 space-y-4">
      <div className="flex justify-between text-sm text-gray-500">
        <span>{topic}</span>
        <span>
          {questionIndex + 1} / {totalQuestions}
        </span>
      </div>
      <div
        className="text-lg leading-relaxed"
        dangerouslySetInnerHTML={{ __html: renderMath(questionText) }}
      />
    </div>
  );
}
```

- [ ] **Step 4: 创建 AnswerInput**

```tsx
// src/components/AnswerInput.tsx
"use client";

import { useState } from "react";

export default function AnswerInput({
  onSubmit,
  disabled,
}: {
  onSubmit: (answer: string) => void;
  disabled: boolean;
}) {
  const [answer, setAnswer] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = answer.trim();
    if (trimmed.length === 0 || disabled) return;
    onSubmit(trimmed);
    setAnswer("");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value.slice(0, 500))}
        placeholder="输入你的答案..."
        disabled={disabled}
        rows={3}
        className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none disabled:opacity-50"
      />
      <div className="flex justify-between items-center">
        <span className="text-xs text-gray-400">{answer.length}/500</span>
        <button
          type="submit"
          disabled={disabled || answer.trim().length === 0}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          提交答案
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 5: 创建 ExplanationPanel**

```tsx
// src/components/ExplanationPanel.tsx
"use client";

import katex from "katex";

function renderMath(text: string): string {
  return text.replace(/\$(.+?)\$/g, (_, math) => {
    try {
      return katex.renderToString(math, { throwOnError: false });
    } catch {
      return math;
    }
  });
}

export default function ExplanationPanel({
  isCorrect,
  boundaryText,
  explanation,
  onContinue,
  onFeedback,
}: {
  isCorrect: boolean;
  boundaryText: string | null;
  explanation: string;
  onContinue: () => void;
  onFeedback: () => void;
}) {
  return (
    <div
      className={`rounded-lg p-6 space-y-4 ${
        isCorrect
          ? "bg-green-50 border border-green-200"
          : "bg-red-50 border border-red-200"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-2xl">{isCorrect ? "\u2705" : "\u274c"}</span>
        <span className="font-semibold">
          {isCorrect ? "回答正确!" : "回答错误"}
        </span>
      </div>

      {boundaryText && (
        <div className="text-sm text-red-700 bg-red-100 p-3 rounded">
          <strong>诊断:</strong> {boundaryText}
        </div>
      )}

      <div
        className="text-gray-700 leading-relaxed"
        dangerouslySetInnerHTML={{ __html: renderMath(explanation) }}
      />

      <div className="flex gap-3">
        <button
          onClick={onContinue}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          继续
        </button>
        <button
          onClick={onFeedback}
          className="px-4 py-2 text-gray-500 hover:text-gray-700 text-sm"
        >
          AI 评分有误?
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: 创建学习页面**

```tsx
// src/app/learn/page.tsx
"use client";

import { useState, useCallback } from "react";
import QuestionCard from "@/components/QuestionCard";
import AnswerInput from "@/components/AnswerInput";
import ExplanationPanel from "@/components/ExplanationPanel";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useRouter } from "next/navigation";

interface GradeResult {
  isCorrect: boolean;
  boundaryText: string | null;
  explanation: string;
  done: boolean;
  questionIndex: number;
}

export default function LearnPage() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questionId, setQuestionId] = useState<string | null>(null);
  const [questionText, setQuestionText] = useState("");
  const [topic, setTopic] = useState("");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [gradeResult, setGradeResult] = useState<GradeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);

  const generateQuestion = useCallback(async (sid?: string) => {
    setLoading(true);
    setGradeResult(null);

    const res = await fetch("/api/challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "generate", sessionId: sid }),
    });
    const data = await res.json();

    if (data.done) {
      router.push("/?completed=true");
      return;
    }

    setSessionId(data.sessionId);
    setQuestionId(data.questionId);
    setQuestionText(data.questionText);
    setTopic(data.topic);
    setQuestionIndex(data.questionIndex);
    setLoading(false);
    setStarted(true);
  }, [router]);

  async function handleAnswer(answer: string) {
    setLoading(true);

    const res = await fetch("/api/challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "answer",
        sessionId,
        studentAnswer: answer,
      }),
    });
    const data: GradeResult = await res.json();

    setGradeResult(data);
    setLoading(false);
  }

  async function handleContinue() {
    if (gradeResult?.done) {
      router.push("/?completed=true");
    } else {
      await generateQuestion(sessionId ?? undefined);
    }
  }

  async function handleFeedback() {
    if (!questionId) return;
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        questionId,
        feedbackType: "grading_error",
      }),
    });
    alert("感谢反馈! 我们会改进评分准确性。");
  }

  if (!started) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold">开始学习</h1>
          <p className="text-gray-600">AI 会根据你的弱点出题</p>
          <button
            onClick={() => generateQuestion()}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            开始
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-bold">学习中</h1>
          <button
            onClick={() => router.push("/")}
            className="text-gray-500 hover:text-gray-700"
          >
            返回
          </button>
        </div>

        {loading ? (
          <LoadingSpinner />
        ) : (
          <>
            <QuestionCard
              questionText={questionText}
              topic={topic}
              questionIndex={questionIndex}
              totalQuestions={5}
            />

            {gradeResult ? (
              <ExplanationPanel
                isCorrect={gradeResult.isCorrect}
                boundaryText={gradeResult.boundaryText}
                explanation={gradeResult.explanation}
                onContinue={handleContinue}
                onFeedback={handleFeedback}
              />
            ) : (
              <AnswerInput onSubmit={handleAnswer} disabled={loading} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: 创建仪表盘首页**

```tsx
// src/app/page.tsx
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { masteryRecords } from "@/db/schema";
import { eq, lte } from "drizzle-orm";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const userId = session.user.id;

  // 获取掌握度数据
  const mastery = await db
    .select()
    .from(masteryRecords)
    .where(eq(masteryRecords.userId, userId));

  const now = new Date();
  const reviewDue = mastery.filter(
    (m) => m.nextReview && m.nextReview <= now
  );

  const hasDiagnosis = mastery.length > 0;

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4 space-y-6">
        <h1 className="text-2xl font-bold">Learner</h1>

        {!hasDiagnosis ? (
          <div className="bg-white rounded-lg shadow p-6 text-center space-y-4">
            <h2 className="text-lg font-semibold">欢迎! 先做个诊断</h2>
            <p className="text-gray-600">
              5 道题，约 10 分钟，帮 AI 了解你的水平
            </p>
            <Link
              href="/diagnose"
              className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              开始诊断
            </Link>
          </div>
        ) : (
          <>
            {reviewDue.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="font-semibold">
                  {reviewDue.length} 个知识点需要复习
                </p>
                <Link
                  href="/learn"
                  className="text-blue-600 hover:underline text-sm"
                >
                  开始复习
                </Link>
              </div>
            )}

            <Link
              href="/learn"
              className="block bg-white rounded-lg shadow p-6 hover:shadow-md transition"
            >
              <h2 className="text-lg font-semibold">继续学习</h2>
              <p className="text-gray-600 text-sm">
                已掌握 {mastery.filter((m) => (m.accuracy ?? 0) > 0.8).length}{" "}
                / {mastery.length} 个知识点
              </p>
            </Link>

            <Link
              href="/progress"
              className="block bg-white rounded-lg shadow p-6 hover:shadow-md transition"
            >
              <h2 className="text-lg font-semibold">查看进度</h2>
              <p className="text-gray-600 text-sm">掌握度地图和边界记录</p>
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 8: 提交**

```bash
git add src/components/ src/app/learn/ src/app/page.tsx src/app/layout.tsx
git commit -m "feat: core learning UI with KaTeX rendering"
```

---

## Task 9: 诊断页 + 进度页

**Files:**
- Create: `src/app/diagnose/page.tsx`
- Create: `src/app/progress/page.tsx`

- [ ] **Step 1: 创建诊断页**

诊断页的交互和学习页类似，但调用 `/api/diagnose` 而非 `/api/challenge`。显示当前模块进度（1/5, 2/5...）。完成后跳转到仪表盘。

结构和 `src/app/learn/page.tsx` 基本一致，替换 API 调用端点和进度显示。

- [ ] **Step 2: 创建进度页**

```tsx
// src/app/progress/page.tsx
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { masteryRecords, boundaries } from "@/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";

export default async function ProgressPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const mastery = await db
    .select()
    .from(masteryRecords)
    .where(eq(masteryRecords.userId, session.user.id))
    .orderBy(masteryRecords.accuracy);

  const allBoundaries = await db
    .select()
    .from(boundaries);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">学习进度</h1>
          <Link href="/" className="text-gray-500 hover:text-gray-700">
            返回
          </Link>
        </div>

        {mastery.map((m) => {
          const topicBoundaries = allBoundaries.filter(
            (b) => b.masteryId === m.id
          );
          const pct = Math.round((m.accuracy ?? 0) * 100);

          return (
            <div key={m.id} className="bg-white rounded-lg shadow p-4 space-y-2">
              <div className="flex justify-between">
                <span className="font-medium">{m.topic}</span>
                <span
                  className={`text-sm font-semibold ${
                    pct >= 80
                      ? "text-green-600"
                      : pct >= 50
                        ? "text-yellow-600"
                        : "text-red-600"
                  }`}
                >
                  {pct}%
                </span>
              </div>

              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>

              {topicBoundaries.length > 0 && (
                <div className="text-xs text-gray-500 space-y-1">
                  {topicBoundaries.map((b) => (
                    <div key={b.id} className="flex items-center gap-1">
                      <span>{b.confirmed ? "\u{1f534}" : "\u{1f7e1}"}</span>
                      <span>{b.boundaryText}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {mastery.length === 0 && (
          <p className="text-center text-gray-500">还没有学习记录。先做个诊断吧!</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 提交**

```bash
git add src/app/diagnose/ src/app/progress/
git commit -m "feat: diagnose and progress pages"
```

---

## Task 10: PWA 配置 + 部署

**Files:**
- Create: `public/manifest.json`
- Create: `public/icons/` (icon files)
- Modify: `next.config.ts`

- [ ] **Step 1: 创建 PWA manifest**

```json
// public/manifest.json
{
  "name": "Learner - AI 数学学习",
  "short_name": "Learner",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#f9fafb",
  "theme_color": "#2563eb",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

- [ ] **Step 2: 生成图标**

用任意工具生成 192x192 和 512x512 的 PNG 图标，放到 `public/icons/`。

- [ ] **Step 3: 创建 Neon 数据库**

1. 访问 https://console.neon.tech
2. 创建项目 "learner"
3. 复制连接字符串到 `.env.local`

- [ ] **Step 4: 运行迁移**

```bash
npx drizzle-kit push
```

- [ ] **Step 5: 本地完整测试**

```bash
npm run dev
```

1. 打开 http://localhost:3000
2. 注册/登录
3. 完成诊断
4. 进入学习，答对答错各测试
5. 查看进度页

- [ ] **Step 6: 部署到 Vercel**

```bash
npm install -g vercel
vercel
```

设置环境变量：
- `DATABASE_URL` → Neon 连接字符串
- `NEXTAUTH_SECRET` → 随机字符串
- `NEXTAUTH_URL` → Vercel 域名
- `GOOGLE_GENERATIVE_AI_API_KEY` → Gemini API key

- [ ] **Step 7: 验证部署**

访问 Vercel 域名，完成一次完整的诊断 + 学习流程。

- [ ] **Step 8: 提交**

```bash
git add -A
git commit -m "feat: PWA config + deployment ready"
```

---

## 计划总结

| Task | 描述 | 预估时间 (CC) |
|------|------|--------------|
| 0 | Gemini Eval | 30 min |
| 1 | 项目初始化 | 10 min |
| 2 | 数据库 Schema | 10 min |
| 3 | SM-2 算法 (TDD) | 10 min |
| 4 | Zod Schema + Gemini 客户端 | 15 min |
| 5 | Prompts + Challenger + Grader + Context | 15 min |
| 6 | NextAuth 认证 | 10 min |
| 7 | 核心 API 路由 | 20 min |
| 8 | 核心学习 UI | 20 min |
| 9 | 诊断页 + 进度页 | 15 min |
| 10 | PWA + 部署 | 15 min |
| **总计** | | **~2.5 小时** |
