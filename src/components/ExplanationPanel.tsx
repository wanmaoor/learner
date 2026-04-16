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
