## 1. Shared / Protocol

- [x] 1.1 不涉及 shared 类型或 SSE 事件结构变更。

## 2. Server

- [x] 2.1 `apps/server/src/agent/prompts.ts`：第 4 条加入"不要为历史回合的地名重新调用工具"约束，明确"摘要表示该地名已处理"。
- [x] 2.2 `apps/server/src/agent/prompts.ts`：新增第 5 条"每轮最多一对工具调用，location 只能取自当前 user 消息"。
- [x] 2.3 `apps/server/src/routes/chat.ts` `historyToAgentMessages`：空 assistant content 不再丢弃，替换为占位摘要 `[此前一回合已生成行程卡或完成处理，请勿为该地名重复调用工具。]`。
- [x] 2.4 `apps/server/src/routes/chat.ts`：新增 `emittedPublicTools: Set<ToolName>`，单轮内同名 tool 第二次以后的 tool_start 直接 continue。
- [x] 2.5 `apps/server/src/routes/chat.ts`：新增 `emittedToolStartRunIds: Set<string>`，被 dedup 抑制的 start 对应的 end 也跳过 cache 落库。
- [x] 2.6 `apps/server/src/routes/chat.ts`：新增 `cardEmitted: boolean`，finalizeTripCard 多次触发时只下发一张 card。

## 3. Web

- [x] 3.1 `apps/web/src/chat/useTravelAgent.ts`：新增 `summarizeAssistantTurn(message)`，按 card / weather+attractions / 空 三档合成摘要。
- [x] 3.2 `apps/web/src/chat/useTravelAgent.ts` `toHistory`：调用 `summarizeAssistantTurn` 替代直接读 `message.content`。

## 4. Validation

- [x] 4.1 `pnpm -r typecheck` 通过。
- [x] 4.2 手工验证多轮场景：连发"上海"→"北京"，EventStream 仅 2 个 tool_start。
- [x] 4.3 手工验证追问场景：连发"上海"→"推荐三天两夜行程"，模型不调工具直接回。
- [x] 4.4 手工验证强压场景：临时放开 prompt，仍只下发北京一对 tool + 一张 card。

## 5. Documentation

- [x] 5.1 不影响 `plans/`。
- [x] 5.2 已沉淀 `questions/多轮对话时 LLM 为历史地名重复调用工具.md`。
- [x] 5.3 此 change 的 proposal/design/tasks/spec 一致。
