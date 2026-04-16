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
