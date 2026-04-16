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
