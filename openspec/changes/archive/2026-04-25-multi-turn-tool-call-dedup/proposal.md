## Why

- 当前问题或机会：
  - 第二次发"我想去北京"时（前一次发的"我想去上海"已经渲染完整 TripCard），EventStream 出现 4 次 tool_start、4 次 tool_end、2 个 card——LLM 对历史地名"上海"和当前"北京"并行重新查询，最终前端渲染出"地点北京 + 景点上海"的错乱卡。
- 为什么现在要做：
  - bug 已经稳定复现；属于阻断核心多轮场景的 P0 问题。
- 如果不做会怎样：
  - 任何包含 ≥2 个城市意图的会话都会出现数据穿插；用户对产品可信度归零。

## What Changes

- `apps/web/src/chat/useTravelAgent.ts`：
  - 新增 `summarizeAssistantTurn(message)`：assistant 空 content + 有 card → 替换为 `[已为「上海」生成完整行程卡（含天气、N 条景点、出行建议）。请勿为该地名重复调用工具。]`。
  - `toHistory` 调用上述函数，让下游 LLM 看到历史回合的明确收口标记。
- `apps/server/src/agent/prompts.ts`：
  - 第 4 条加入"不要为历史回合的地名重新调用工具"约束。
  - 新增第 5 条"每轮最多一对工具调用，location 只能取自当前 user 消息"。
- `apps/server/src/routes/chat.ts`：
  - `historyToAgentMessages`：空 assistant content 不再丢弃，替换为占位摘要 `[此前一回合已生成行程卡或完成处理，请勿为该地名重复调用工具。]`。
  - 新增三套单轮去重状态：
    - `emittedPublicTools: Set<ToolName>`：每个公开工具单轮内最多 emit 一次 tool_start。
    - `emittedToolStartRunIds: Set<string>`：被 dedup 抑制的 start 对应的 end 也跳过，不污染 cache。
    - `cardEmitted: boolean`：finalizeTripCard 多次触发时只下发一张 card。

## Capabilities

### New Capabilities

- `tool-orchestration`: 沉淀单轮内工具调用的去重、跨轮历史摘要与 prompt 约束的协议边界。

### Modified Capabilities

- 无（首次为多轮工具编排沉淀 capability）。

### Removed Capabilities

- 无。

## Impact

- Affected workspaces:
  - `apps/web`: `chat/useTravelAgent.ts`。
  - `apps/server`: `agent/prompts.ts`、`routes/chat.ts`。
  - `packages/shared`: 不变。
- Affected APIs / protocols:
  - `tool_start` / `tool_end` / `card` 事件下发顺序与数量；客户端语义不变（仍是"按顺序消费"）。
  - `/api/chat` 请求体里 history 中的 assistant content 形态变化（前端会合成可读摘要）。
- Compatibility impact:
  - 完全向后兼容；旧客户端发送空 assistant content 时 backend 会自动占位兜底。
- Risks:
  - 极端场景 LLM 仍可能并发调相同工具，被 backend 静默吞掉——通过日志能看到，可用作监控信号。
- Rollback:
  - 回退此 change：前端 toHistory 退化为原样，backend 三套去重移除。bug 会复现，但功能不破坏。
- Docs to update:
  - `questions/多轮对话时 LLM 为历史地名重复调用工具.md`：本 change 与该排障文档同源，文档已沉淀。
