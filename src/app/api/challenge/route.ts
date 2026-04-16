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
