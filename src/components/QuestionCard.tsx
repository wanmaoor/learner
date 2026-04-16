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
