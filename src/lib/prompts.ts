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
