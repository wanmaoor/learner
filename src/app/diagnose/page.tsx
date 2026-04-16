"use client";

import { useState, useCallback } from "react";
import QuestionCard from "@/components/QuestionCard";
import AnswerInput from "@/components/AnswerInput";
import ExplanationPanel from "@/components/ExplanationPanel";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useRouter } from "next/navigation";

interface DiagnoseQuestion {
  questionId: string;
  questionText: string;
  topic: string;
  moduleIndex: number;
  moduleName: string;
  totalModules: number;
}

interface GradeResult {
  isCorrect: boolean;
  explanation: string;
  boundaryText: string | null;
  done: boolean;
  nextQuestion?: DiagnoseQuestion;
}

export default function DiagnosePage() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [question, setQuestion] = useState<DiagnoseQuestion | null>(null);
  const [gradeResult, setGradeResult] = useState<GradeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);

  const startDiagnose = useCallback(async () => {
    setLoading(true);

    const res = await fetch("/api/diagnose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start" }),
    });
    const data = await res.json();

    if (data.alreadyDiagnosed) {
      router.push("/");
      return;
    }

    setSessionId(data.sessionId);
    setQuestion({
      questionId: data.questionId,
      questionText: data.questionText,
      topic: data.topic,
      moduleIndex: data.moduleIndex,
      moduleName: data.moduleName,
      totalModules: data.totalModules,
    });
    setLoading(false);
    setStarted(true);
  }, [router]);

  async function handleAnswer(answer: string) {
    if (!sessionId || !question) return;
    setLoading(true);

    const res = await fetch("/api/diagnose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "answer",
        sessionId,
        studentAnswer: answer,
        moduleIndex: question.moduleIndex,
      }),
    });
    const data: GradeResult = await res.json();

    setGradeResult(data);
    setLoading(false);
  }

  async function handleContinue() {
    if (!gradeResult) return;

    if (gradeResult.done) {
      router.push("/?diagnosed=true");
      return;
    }

    if (gradeResult.nextQuestion) {
      setQuestion(gradeResult.nextQuestion);
      setGradeResult(null);
    }
  }

  async function handleFeedback() {
    if (!question) return;
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        questionId: question.questionId,
        feedbackType: "grading_error",
      }),
    });
    alert("感谢反馈! 我们会改进评分准确性。");
  }

  if (!started) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-4 max-w-md px-4">
          <h1 className="text-2xl font-bold">知识诊断</h1>
          <p className="text-gray-600">
            我们会从 5 个核心模块各出一道题，快速了解你的数学水平。大约需要 5 分钟。
          </p>
          <button
            onClick={startDiagnose}
            disabled={loading}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "准备中..." : "开始诊断"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-bold">知识诊断</h1>
          <span className="text-sm text-gray-500">
            模块 {(question?.moduleIndex ?? 0) + 1} / {question?.totalModules ?? 5}
          </span>
        </div>

        {question && (
          <div className="text-sm text-gray-500 bg-white rounded-lg px-4 py-2 shadow-sm">
            当前模块: <span className="font-medium text-gray-700">{question.moduleName}</span>
          </div>
        )}

        {loading ? (
          <LoadingSpinner />
        ) : (
          <>
            {question && (
              <QuestionCard
                questionText={question.questionText}
                topic={question.topic}
                questionIndex={question.moduleIndex}
                totalQuestions={question.totalModules}
              />
            )}

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
