## Context

- 现状：
  - PRD 要求 LLM 调完 `finalizeTripCard` 后空字符串收尾，所以 assistant 历史 content 为 ""。
  - `apps/web/src/chat/useTravelAgent.ts` 的 `toHistory` 把空 content 原样发给 backend。
  - `apps/server/src/routes/chat.ts` 的 `historyToAgentMessages` 旧版 `filter` 把空 content 整条丢掉。
  - 结果 LLM 看到两条连续 user 消息（"我想去上海" + "我想去北京"），把它当成"两个并行任务"，4 次工具调用 + 2 次 finalize。
  - chat.ts 没有任何"单轮内工具去重"逻辑，第二次工具结果会覆盖第一次的 cache。
- 本次变更入口：
  - 用户上报多轮场景渲染错乱；EventStream 显示 4 个 tool_start。
- 现有限制：
  - 不能违反 "LLM 调完 finalizeTripCard 后空字符串收尾"的 PRD 约束。
  - 不能改 SSE 事件类型。

## Goals / Non-Goals

**Goals:**

- 多轮场景下 LLM 只为当前 user 消息调一对工具。
- 即便 LLM 抽风并发调多次同名工具，server 端只 emit 第一次的 tool_start / tool_end / card。
- 历史回合的"已完成"事实显式传达给 LLM，不靠模型自然推断。

**Non-Goals:**

- 不引入会话状态持久化。
- 不在前端再做一层"历史地名提醒"。

## Affected Layers

- `packages/shared`:
  - 无。
- `apps/server`:
  - `agent/prompts.ts`、`routes/chat.ts`。
- `apps/web`:
  - `chat/useTravelAgent.ts`。

## Decisions

### 1. 三层兜底联动

- Decision:
  - 前端合成摘要 + backend 占位兜底 + prompt 约束 + backend 单轮去重，四层组合使用，缺一不可。
- Rationale:
  - 前端摘要给 LLM 最具体的城市级上下文（最有效）；backend 占位是旧客户端兜底；prompt 是模型行为约束；backend 去重是模型不听话时的硬保险。
- Rejected alternatives:
  - 只改 prompt：模型仍会偶发抽风。
  - 只改 backend dedup：LLM 仍会浪费 token 并发调用工具，影响延迟。

### 2. 去重粒度：按工具名（不是 run_id）

- Decision:
  - `emittedPublicTools: Set<ToolName>` 按工具名去重，第二次 `getWeather` 不论 run_id 都被抑制。
- Rationale:
  - 同名工具的多次并发结果会污染 cache（`cachedWeather` 被覆盖），按 run_id 去重无法防御。按名字去重才能保证"单轮内每个工具最多一份结果"。
- Rejected alternatives:
  - 按 run_id 去重：抑制不了不同 run_id 的并发调用。

### 3. start/end 状态联动

- Decision:
  - `emittedToolStartRunIds: Set<string>` 跟踪哪些 run_id 的 tool_start 真正 emit 出去；end 阶段查不到 run_id 就跳过 cache 落库。
- Rationale:
  - 如果 start 抑制了但 end 仍落 cache，就会出现"前端没看到 tool_start 但 cache 被覆盖"的诡异状态。
- Rejected alternatives:
  - end 阶段只看 emittedPublicTools：无法区分"是该 tool 的真正第一次 end"还是"被抑制的第二次 end"。

### Data Flow / Responsibility

- 请求入口：
  - 前端 `useTravelAgent.onRequest` 构造 `body.history`（已合成摘要）→ POST /api/chat → backend `historyToAgentMessages`（占位兜底）→ LangGraph agent。
- 数据返回：
  - SSE `tool_start` / `tool_end` / `card` 经 chat.ts 三套去重门控后下发；前端 reducer 不感知去重，按"后到覆盖"语义合并。
- 职责边界：
  - 前端：把"已完成"摘要写进 history。
  - prompt：约束 LLM 单轮行为。
  - backend：硬性兜底，避免模型抽风影响 UI。

### Compatibility / Migration

- 是否有字段兼容问题：无；history.content 字符串内容变化对协议无影响。
- 是否需要迁移旧数据：无。
- 是否需要重启 dev server：是，prompt + backend 改动需要重编。

## Validation Plan

- 类型检查：`pnpm -r typecheck` 通过。
- 手工验证：
  - 连发 "上海" → "北京"：EventStream 应只看到 2 个 tool_start、2 个 tool_end、1 个 card，且全部是北京数据。
  - 连发 "上海" → "推荐三天两夜行程"：模型应不再调任何工具，直接以文本回答。
  - 强压：临时把 prompt 改成允许"为多个城市并行查询"，再连发"上海"→"北京"。即便模型按指令并发，server 仍只下发北京的一对 tool 事件 + 一张 card。
  - 退化：手动清掉前端 `summarizeAssistantTurn`（模拟旧客户端），backend 占位兜底应保证 LLM 仍能识别"上一轮已完成"。

## Risks / Trade-offs

- 风险 1：合成的"已完成"摘要可能让模型误解为不需要任何回应。
  - 缓解：摘要仅作为历史 turn 的内容，当前 user 消息仍由 LLM 决定行为；prompt 已说明"摘要表示之前已处理"。
- 风险 2：极少数场景下用户确实想"重新查同一城市"（譬如"上海最新天气"）。
  - 缓解：prompt 限定为"地名"维度——同一城市重复出现仍可调，单轮内仍最多一对工具。

## Documentation Sync

- 需要同步的 `plans/` 文档：无。
- 需要同步的 `questions/` 文档：
  - `questions/多轮对话时 LLM 为历史地名重复调用工具.md`（已与本 change 同步沉淀）。
