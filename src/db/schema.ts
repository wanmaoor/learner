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
