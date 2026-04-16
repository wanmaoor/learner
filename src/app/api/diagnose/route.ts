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
import { calculateSm2 } from "@/lib/sm2";

const MODULES = ["函数", "导数", "三角函数", "概率统计", "立体几何"];

function sanitizeInput(text: string): string {
  return text
    .replace(/<[^>]*>/g, "")
    .slice(0, 500);
}

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
    const startTime = Date.now();
    const question = await generateQuestion({
      mode: "diagnose",
      module: MODULES[0],
    });
    const latencyMs = Date.now() - startTime;

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

    await db.insert(analyticsEvents).values({
      userId,
      eventType: "api_call",
      metadata: { type: "diagnose", latency_ms: latencyMs },
    });

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

  if (action === "answer") {
    if (!studentAnswer || !sessionId || moduleIndex === undefined) {
      return NextResponse.json(
        { error: "Missing studentAnswer, sessionId, or moduleIndex" },
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

    // 评分
    const startTime = Date.now();
    const gradeResult = await gradeAnswer({
      questionText: currentQuestion.questionText,
      canonicalAnswer: currentQuestion.canonicalAnswer,
      solutionSteps: (currentQuestion.solutionSteps as string[]) ?? [],
      studentAnswer: sanitized,
      existingBoundaries: [],
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

    // 创建或更新 mastery_record
    const [existingMastery] = await db
      .select()
      .from(masteryRecords)
      .where(
        and(
          eq(masteryRecords.userId, userId),
          eq(masteryRecords.topic, currentQuestion.topic)
        )
      )
      .limit(1);

    if (!existingMastery) {
      const sm2Result = calculateSm2({
        quality: gradeResult.sm2_quality,
        repetitions: 0,
        easiness: 2.5,
        interval: 1,
      });

      const [newMastery] = await db
        .insert(masteryRecords)
        .values({
          userId,
          topic: currentQuestion.topic,
          accuracy: gradeResult.is_correct ? 1 : 0,
          attempts: 1,
          successes: gradeResult.is_correct ? 1 : 0,
          sm2Interval: sm2Result.interval,
          sm2Easiness: sm2Result.easiness,
          sm2Repetitions: sm2Result.repetitions,
          nextReview: sm2Result.nextReview,
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
      const newAttempts = (existingMastery.attempts ?? 0) + 1;
      const newSuccesses =
        (existingMastery.successes ?? 0) + (gradeResult.is_correct ? 1 : 0);

      const sm2Result = calculateSm2({
        quality: gradeResult.sm2_quality,
        repetitions: existingMastery.sm2Repetitions ?? 0,
        easiness: existingMastery.sm2Easiness ?? 2.5,
        interval: existingMastery.sm2Interval ?? 1,
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
        .where(eq(masteryRecords.id, existingMastery.id));
    }

    await db.insert(analyticsEvents).values({
      userId,
      eventType: "api_call",
      metadata: { type: "diagnose_grade", latency_ms: latencyMs },
    });

    // 判断是否还有下一个模块
    const nextModuleIndex = moduleIndex + 1;
    const isDone = nextModuleIndex >= MODULES.length;

    if (isDone) {
      // 诊断完成
      await db
        .update(sessions)
        .set({
          status: "completed",
          currentQuestionIndex: MODULES.length,
        })
        .where(eq(sessions.id, sessionId));

      return NextResponse.json({
        isCorrect: gradeResult.is_correct,
        explanation: gradeResult.explanation,
        boundaryText: gradeResult.boundary_text,
        done: true,
      });
    }

    // 出下一个模块的题
    const nextQuestion = await generateQuestion({
      mode: "diagnose",
      module: MODULES[nextModuleIndex],
    });

    const [savedNext] = await db
      .insert(questions)
      .values({
        sessionId,
        userId,
        topic: nextQuestion.topic,
        questionText: nextQuestion.question_text,
        canonicalAnswer: nextQuestion.canonical_answer,
        solutionSteps: nextQuestion.solution_steps,
        modelVersion: nextQuestion.modelVersion,
      })
      .returning();

    await db
      .update(sessions)
      .set({ currentQuestionIndex: nextModuleIndex })
      .where(eq(sessions.id, sessionId));

    return NextResponse.json({
      isCorrect: gradeResult.is_correct,
      explanation: gradeResult.explanation,
      boundaryText: gradeResult.boundary_text,
      done: false,
      nextQuestion: {
        questionId: savedNext.id,
        questionText: nextQuestion.question_text,
        topic: nextQuestion.topic,
        moduleIndex: nextModuleIndex,
        moduleName: MODULES[nextModuleIndex],
        totalModules: MODULES.length,
      },
    });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
