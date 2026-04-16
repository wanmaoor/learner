# Learner MVP v2 设计文档

日期: 2026-04-15
状态: CEO 评审通过（HOLD SCOPE）
基于: office-hours 设计文档 (2026-04-13) + 核心论点验证 (2026-04-14)

## 与原设计的关键变更

| 原设计 | 本次简化 | 原因 |
|--------|---------|------|
| 多 Agent（Challenger + Teacher + Scheduler） | 单 Agent（Challenger 兼解析） | 降低复杂度，先验证核心价值 |
| 手动知识图谱（50-100 节点） | 无知识图谱，LLM 动态识别 | 验证已证明 LLM 能精确识别边界，不需要预设结构 |
| 费曼式 Teacher Agent | 简单错题解析（Challenger 附带） | Teacher 是锦上添花，不是核心 |
| 反向讲解验证 | 砍掉 | 模块复杂且未细化设计，用"连续答对"替代验证 |
| 试卷上传诊断（首选路径） | 砍掉，用 Challenger 诊断题替代 | 避免 OCR 依赖，简化冷启动 |
| 精选题库（200-300 道） | 无题库，AI 实时生成 | 消除冷启动内容成本 |
| Claude/OpenAI API | Gemini API | 用户决策 |
| Next.js + PWA | Next.js + PWA（不变） | 不变 |

## 一句话

Challenger Agent 找到你知识的精确边界，针对性出题攻击它，SM-2 确保你不会忘。

## 核心论点（已验证）

LLM 能从学生的错误答案中：
1. 提取精确的失败模式（不是"链式法则不会"，而是"链式法则中遗漏内层函数导数"）— 验证 20/20
2. 判断两个错误是否属于同一模式（语义匹配）— 验证 10/10

这意味着不需要预设的知识图谱。LLM 就是知识图谱。

## 核心流程

```
用户注册 → 选择科目（高中数学）
                ↓
        冷启动诊断（5 个模块各 1 题，约 10 分钟）
                ↓
        生成初始掌握度地图
                ↓
    ┌──→ Challenger 选最薄弱的 topic
    │           ↓
    │     Challenger 出题 → 返回题目 + 标准答案 + 解题步骤（存 DB，学生不可见）
    │           ↓
    │     学生作答（纯文本输入）
    │           ↓
    │     Grader 对比标准答案 → 评分 + 边界诊断 + 解析
    │           ↓
    │     答对 → 换角度/设陷阱/换情境继续出题（自动推进）
    │     答错 → 展示边界 + 解析 → 自动出下一题（攻击同一边界）
    │           ↓
    │     边界确认：2+ 次相同模式失败 → 边界锁定
    │     边界突破：连续 3 次不同角度答对 → 标记掌握
    │           ↓
    │     SM-2 更新间隔 → 加入复习队列
    │           ↓
    └──← 下一个 topic（或复习到期项）
```

**关键设计决策：出题与评分分离。** Challenger 出题时同时生成标准答案和解题步骤（学生看不到）。
学生答题后，Grader 拿标准答案对比评分并诊断边界。两次 LLM 调用，更可靠、更可审计。

### 每次登录流程

1. 检查复习队列（SM-2 到期项）
2. 有到期项 → 先做复习（按逾期程度排序）
3. 复习完 → 继续学新知识（最薄弱的 topic）
4. 学习过程中每 4 题穿插 1 道复习题

### 冷启动诊断

无试卷上传，Challenger 直接出题探测：
- 5 个核心模块：函数、导数、三角函数、概率统计、立体几何
- 每模块 1 道中等题（选择题或简答题），约 10 分钟
- 结果：每模块分类为"已掌握 / 部分掌握 / 薄弱"
- 后续学习中逐步细化诊断，不在冷启动阶段深入探测

### 出题策略

Challenger 不是随机出题，而是有策略地攻击边界：
- **同知识点换角度**：链式法则 → sin(x^2)、ln(2x+1)、e^(3x) 不同外层函数
- **设陷阱**：在已知的边界条件处出题，看学生是否真的突破了
- **换情境**：同样的数学概念放到应用题中
- **每 topic 每会话最多 5 题**：防止挫败感

### 简单解析

答错时，Challenger 附带一段解析：
- 指出具体错在哪（边界描述）
- 给出正确的解题思路（2-3 步）
- 不做深度教学，不做类比解释
- 如果学生反复在同一边界犯错（3+ 次），解析会更详细

## 架构

```
客户端：Next.js（Web + PWA）
    |
API 路由（Next.js API Routes）
    |
Challenger Agent
├── 诊断模式：冷启动探测
├── 挑战模式：针对性出题 + 边界检测
├── 解析模式：错题解释
└── 调度模式：SM-2 更新 + 复习队列管理
    |
数据层
├── PostgreSQL — 用户、掌握度记录、会话
└── Redis — 会话缓存（可选，MVP 可以不用）
    |
Gemini API
```

### 单 Agent，两步调用

Challenger Agent 通过 system prompt 切换模式：

```
出题调用（Challenger）：
- [DIAGNOSE] → 冷启动诊断出题
- [CHALLENGE] → 针对性出题
→ 返回：题目 + 标准答案 + 解题步骤

评分调用（Grader）：
- [GRADE] → 对比标准答案评分 + 边界诊断 + 解析
→ 返回：正确/错误 + boundary_text + 解析文本
```

每次出题调用包含：
1. 模式对应的 system prompt
2. 学生掌握度快照（topics + boundaries + accuracy）
3. 已有 topics 列表（用于 in-prompt 一致性匹配）
4. 当前会话最近 3 轮对话
5. 估计 ~3-4K tokens/调用

每次评分调用包含：
1. Grader system prompt
2. 题目 + 标准答案 + 解题步骤
3. 学生答案
4. 该 topic 已知的 boundaries 列表（用于匹配）
5. 估计 ~2K tokens/调用

### 上下文组装

```yaml
student_snapshot:
  current_topic: "导数.复合函数求导"
  mastery_map:
    "导数.复合函数求导":
      accuracy: 0.2
      boundaries:
        - text: "内层函数是三角函数时遗漏内层导数"
          confirmed: true
          attempts: 4
          last_seen: "2026-04-15"
        - text: "混淆幂函数和指数函数求导规则"
          confirmed: false
          attempts: 1
      sm2_interval: 1
      next_review: "2026-04-16"
  review_due: ["二次函数.含参求最值", "概率.条件概率"]
```

## 数据模型

```sql
-- 用户
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 掌握度记录（每个 topic 一条）
CREATE TABLE mastery_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  topic TEXT NOT NULL,           -- LLM 动态生成的 topic 路径，如 "导数.复合函数求导"
  accuracy REAL DEFAULT 0,       -- 正确率
  attempts INTEGER DEFAULT 0,    -- 总尝试次数
  successes INTEGER DEFAULT 0,   -- 成功次数
  sm2_interval REAL DEFAULT 1,   -- SM-2 间隔（天）
  sm2_easiness REAL DEFAULT 2.5, -- SM-2 易度因子
  sm2_repetitions INTEGER DEFAULT 0,
  next_review TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, topic)
);

-- 知识边界（每个 topic 可有多个边界）
CREATE TABLE boundaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mastery_id UUID REFERENCES mastery_records(id),
  boundary_text TEXT NOT NULL,    -- 自然语言边界描述
  confirmed BOOLEAN DEFAULT false, -- 2+ 次相同模式失败则确认
  attempts INTEGER DEFAULT 0,
  successes INTEGER DEFAULT 0,    -- 针对这个边界的成功次数
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 会话记录（必须在 questions 之前创建，因为 questions 引用 sessions）
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  session_type TEXT NOT NULL,     -- 'diagnose' | 'challenge' | 'review'
  topic TEXT,
  status TEXT DEFAULT 'active',   -- 'active' | 'completed' | 'abandoned'
  current_question_index INTEGER DEFAULT 0,
  summary TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 题目记录（每道 AI 生成的题目一条，可审计）
CREATE TABLE questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id),
  user_id UUID REFERENCES users(id),
  topic TEXT NOT NULL,
  question_text TEXT NOT NULL,        -- 题目文本
  canonical_answer TEXT NOT NULL,     -- 标准答案
  solution_steps JSONB,               -- 解题步骤（数组）
  student_answer TEXT,                -- 学生答案
  is_correct BOOLEAN,                -- 评分结果
  boundary_detected TEXT,             -- 诊断出的边界（如有）
  grading_rationale TEXT,             -- 评分理由
  model_version TEXT,                 -- Gemini 模型版本
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 分析事件（基础可观测性）
CREATE TABLE analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  event_type TEXT NOT NULL,       -- 'api_call' | 'error' | 'feedback' | 'session_complete'
  metadata JSONB DEFAULT '{}',    -- tokens_used, model, latency_ms, error_message 等
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**注意：** sessions 表不再需要 JSONB turns 字段。每道题的完整记录在 questions 表中，
通过 session_id 关联。这样可以用 SQL 查询"Gemini 在哪些题目上评分错了"。

## SM-2 调度

质量评分映射：
- 连续 3 次不同角度答对 = 5（完美）
- 答对 = 4
- 提示后答对 = 3
- 答错后看解析自行纠正 = 2
- 答错 = 0

初始参数：interval=1 天，easiness=2.5，repetitions=0

复习队列溢出：到期项 > 10 个时，按逾期天数排序取前 10，其余等下次。

## 容错

- Gemini API 重试：429/500 时指数退避重试 2 次
- LLM 响应格式错误：验证 JSON 结构，解析失败用更严格的 prompt 重试一次
- AI 生成题目的数学正确性：附加"如果发现错误请点击反馈"按钮（MVP 仅记录）
- 会话恢复：每轮后将状态持久化，用户关闭浏览器后可恢复

## 用户界面（粗略）

1. **登录页** — 邮箱/密码
2. **首页/仪表盘** — 复习到期数、今日学习建议、掌握度概览
3. **学习页** — 题目展示 + 答题区 + 解析展示
4. **诊断页** — 冷启动诊断流程
5. **进度页** — topic 列表 + 每个的掌握度和边界

## MVP 范围

**范围内：**
- 高中数学（一个科目）
- Challenger Agent（诊断 + 出题 + 解析 + 调度，一个 Agent 四种模式）
- AI 实时生成题目，无预设题库
- LLM 动态识别知识点和边界，无知识图谱
- SM-2 间隔重复
- 冷启动诊断（Challenger 出题探测）
- Web + PWA
- 邮箱/密码认证

**范围外（V2+）：**
- 多科目
- Teacher Agent（费曼式深度教学）
- 反向讲解验证
- 试卷拍照上传
- 语音交互（TTS/STT）
- 社区共享题库
- 知识图谱 / 精选题库
- 商业化
- 原生 App
- 微信登录

## 成功标准

1. 冷启动诊断 10 分钟内完成，学生能看到有意义的掌握度地图
2. Challenger 每次会话至少发现一个学生不知道自己不知道的边界
3. 边界检测和匹配的准确率在真实使用中保持 >80%
4. 学习闭环感觉自然：做题 → 发现盲点 → 解析 → 再试 → 记住
5. 复习时一次通过率 >60%（衡量学习效果，不只是发现弱点）

## topic 一致性策略

LLM 动态生成 topic 路径有"漂移"风险（同一个知识点可能被叫做"导数.复合函数求导"或"复合函数的导数"）。

缓解方案：每次 Challenger 出题时，prompt 中带上该用户已有的 topics 列表。LLM 被要求优先匹配已有 topic，只有确实是新知识点时才创建新 topic。不做额外的语义校验 LLM 调用。如果发生漂移，后续可以批量清理。

## 输入输出格式

**学生输入：** 纯文本。学生用自然语言写数学答案（如 "f'(x) = 2x*cos(x^2)" 或 "导数是2x乘以cosx平方"）。不需要 LaTeX 输入。LLM 足够聪明来解析自由文本数学表达。

**数学渲染：** 使用 KaTeX 渲染 LLM 输出中的数学公式。LLM 输出 LaTeX 格式，前端用 KaTeX 渲染成可读公式。

**输入安全：** 学生输入做基本清洗（去除 HTML/script 标签，长度限制 500 字符）。LLM 输出做 JSON schema 验证，不符合预期格式则重试。

## LLM 输出 Schema

### 出题调用（Challenger）返回格式

```json
{
  "topic": "导数.复合函数求导",
  "question_text": "求 f(x) = sin(x²) 的导数 f'(x)",
  "canonical_answer": "f'(x) = 2x \\cdot \\cos(x^2)",
  "solution_steps": [
    "识别外层函数 sin(u) 和内层函数 u = x²",
    "外层导数：cos(u) = cos(x²)",
    "内层导数：2x",
    "链式法则：f'(x) = cos(x²) · 2x = 2x·cos(x²)"
  ],
  "difficulty": "medium",
  "targeting_boundary": "链式法则遗漏内层导数"
}
```

### 评分调用（Grader）返回格式

```json
{
  "is_correct": false,
  "boundary_text": "链式法则中遗漏内层函数的导数",
  "matches_existing_boundary": true,
  "matched_boundary_id": "uuid-of-existing-boundary",
  "explanation": "你的答案 cos(x²) 只对外层函数 sin 求了导...",
  "sm2_quality": 0
}
```

## 可观测性

MVP 使用 Postgres analytics_events 表做基础监控，不需要外部服务：

- **API 成本追踪：** 每次 Gemini 调用记录 tokens_used、model、latency_ms
- **错误率：** 每次 LLM 调用失败记录 error_type、error_message
- **评分准确性信号：** 用户点击"AI 评分有误"反馈按钮时记录 question_id
- **会话完成率：** 记录每次会话的开始和完成（或放弃）
- **边界检测统计：** 可通过 questions 表 SQL 查询分析

查询示例：
```sql
-- 本周 API 成本
SELECT SUM((metadata->>'tokens_used')::int) FROM analytics_events
WHERE event_type = 'api_call' AND created_at > now() - interval '7 days';

-- 被用户标记为评分错误的题目
SELECT q.* FROM questions q
JOIN analytics_events ae ON ae.metadata->>'question_id' = q.id::text
WHERE ae.event_type = 'feedback';
```

## 部署方案

- **前端 + API：** Vercel（免费额度）
- **数据库：** Neon Postgres（免费额度：0.5GB 存储，自动缩扩）
- **ORM：** 实现阶段决定（Drizzle 或 Prisma）
- **环境变量：** Gemini API key、Neon 连接字符串，存 Vercel 环境变量
- **迁移：** ORM 内置迁移工具
- **回滚：** Vercel 一键回滚到前一部署

## 成本估算

出题调用 ~3-4K tokens 输入 + ~1K 输出。
评分调用 ~2K tokens 输入 + ~0.5K 输出。
每题两次调用，每会话约 5 题 = ~10 次调用 = ~55-65K tokens/会话。
Gemini 1.5 Flash 定价约 $0.075/M 输入 + $0.30/M 输出。
每会话成本约 $0.008-0.015。
每用户每日上限：100K tokens（约 6-8 会话）。

## 风险

| 风险 | 影响 | 缓解 |
|------|------|------|
| LLM 生成的题目数学有误 | 学生学到错误知识 | 反馈按钮 + 日志监控 |
| topic 归类不一致 | 掌握度记录混乱 | prompt 带已有 topics 列表 + 语义校验合并 |
| Gemini API 成本超预期 | 烧钱 | 每用户每日 token 上限 |
| 学生只刷不思考 | 学习效果差 | Challenger 换角度出题，不让你靠记忆过关 |
| "连续3次答对=掌握"太宽松 | 假阳性，学生以为掌握了其实没有 | SM-2 短间隔复检，如果复习时再次失败则重新打开边界 |

## 下一步

0. **Gemini eval（开发前门槛）** — 用 Gemini CLI 跑 validation/test-cases.json，确认边界检测 >= 70%
1. 初始化 Next.js 项目 + Neon Postgres + NextAuth
2. 实现 Challenger Agent 出题（prompt 设计 + Zod schema 验证）
3. 实现 Grader 评分（标准答案对比 + 边界诊断）
4. 实现核心学习流程 UI（KaTeX 渲染 + 纯文本输入）
5. 实现 SM-2 调度
6. 实现冷启动诊断
7. 部署到 Vercel + Neon

## 数据库索引

```sql
CREATE INDEX idx_mastery_user ON mastery_records(user_id);
CREATE INDEX idx_boundaries_mastery ON boundaries(mastery_id);
CREATE INDEX idx_questions_session ON questions(session_id);
CREATE INDEX idx_questions_user_date ON questions(user_id, created_at);
CREATE INDEX idx_sessions_user_status ON sessions(user_id, status);
CREATE INDEX idx_analytics_type_date ON analytics_events(event_type, created_at);
```

## CEO 评审变更记录（2026-04-15）

本次 CEO 评审（HOLD SCOPE 模式）对设计文档做了以下变更：

1. **出题与评分分离** — Challenger 出题时生成标准答案，Grader 对比评分。两步 LLM 调用，更可靠更可审计。
2. **添加 questions 表** — 每道题有独立的一等实体，包含标准答案、学生答案、评分结果、边界诊断、模型版本。
3. **添加 analytics_events 表** — 基础可观测性：API 成本、错误率、用户反馈、会话完成率。
4. **冷启动诊断调整** — 从 10-15 题/5 分钟改为 5 题/10 分钟，更现实。
5. **topic 一致性简化** — 去掉额外的语义校验 LLM 调用，改为 in-prompt 匹配。
6. **定义 LLM 输出 Schema** — Challenger 和 Grader 的 JSON 返回格式。
7. **输入输出格式** — 学生纯文本输入，KaTeX 渲染输出。输入安全（HTML 清洗 + 长度限制）。
8. **部署方案明确** — Vercel + Neon Postgres。
9. **成功标准新增** — "复习一次通过率 >60%"，衡量学习效果。
10. **成本估算更新** — 两步调用模式下每会话约 $0.008-0.015。

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | CLEAR | HOLD SCOPE, 0 critical gaps, 10 spec updates |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | issues_found | 12 findings, 3 accepted |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 3 issues, 0 critical gaps, 30 test paths mapped |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **CODEX:** 12 findings. 3 accepted (分离评分步骤、缩减诊断题量、添加 questions 表).
- **ENG:** 3 issues found and fixed: CREATE TABLE 顺序 bug、solution_steps 类型 bug、sessions 缺少状态字段。30 个测试路径已规划。Gemini eval 加为开发前门槛。
- **UNRESOLVED:** 0
- **VERDICT:** CEO + ENG CLEARED. 可以进入实现。
