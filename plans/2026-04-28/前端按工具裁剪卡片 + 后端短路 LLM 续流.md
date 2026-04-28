# 仅天气查询：前端按工具裁剪卡片 + 后端短路 LLM 续流

## Context

用户输入"查询一下北京的天气"这种**只想看天气**的请求时，原行为：

- 前端一次性把整套 TripCardView（Hero / Weather / Attractions / Recommendation + Chips 共 5 块）骨架顶上，最终非 Weather 的 4 块会停在"未生成地点总结 / 景点接口暂未返回数据 / 未生成出行建议"等占位文案。
- 后端 LLM 在 `finalizeTripWeather` 之后还会续写一大段 markdown 文本（重复描述天气表），白烧若干秒和大量 token。

期望：

- 仅天气：assistant 消息**只**渲染 WeatherCard；后端在 `card_weather` 之后直接收尾到 `final` + `done`，不再续写。
- 仅 `getAttractions`（不进 finalize）：渲染 WeatherCard（如有）+ AttractionList。
- 完整 TripCard 流（finalizeTripDestination + finalizeTripAttractionsSummary 都跑了）：保持现状，5 块 + chips 渐进展示。
- 仅闲聊：保持 markdown 气泡兜底。

## 实现要点（含两次迭代修正）

### 关键事实（实测得出，最初设计漏掉）

1. **`tool_start` / `tool_end` 仅对 `getWeather` / `getAttractions` 下发**（[packages/shared/src/chat.ts:24-31](packages/shared/src/chat.ts:24)），`finalizeTrip*` / `recommendItinerary` 是内部工具，由 chat 路由消费后转成 `card_*` / `itinerary` 结构化事件。
2. **weather-only 流程也会发 `card_weather`**：LLM 在 `getWeather` 返回后会继续调一次 `finalizeTripWeather` 来生成天气 summary，[handlers.ts:288](apps/server/src/routes/chat/handlers.ts:288) 在工具结束时 emit `card_weather`。所以"`progressiveCard` 是否存在"**不能**作为"是否进入完整 TripCard 流"的判定 —— 它在仅天气场景也会被填上 `weather` 字段。
3. **完整 TripCard 流的可靠信号**只有 `card_destination`（→ `progressiveCard.hero`）或 `card_attractions_summary`（→ `progressiveCard.recommendation`）到达。Prompt step2/step4 强制这两步在完整流中必跑。

### 改动 1：useTravelAgent —— 记录 `toolsStarted`

修改 [apps/web/src/chat/useTravelAgent.ts](apps/web/src/chat/useTravelAgent.ts)：

- `TravelChatMessage` 新增 `toolsStarted?: ToolName[]`。
- `tool_start` 分支用 `setMessages(prev => prev.map(...))` 把工具名追加到当前 assistant 消息的 `toolsStarted` 数组（去重）；同时保留原 `hasToolStart = true` 行为，向后兼容 ChatPage 切换到卡片流的判定。

> 实际只会包含 `getWeather` / `getAttractions`，类型上仍按 `ToolName[]` 保持枚举一致。

### 改动 2：TripCardView —— 按槽位条件渲染

修改 [apps/web/src/chat/cards/TripCardView/TripCardView.tsx](apps/web/src/chat/cards/TripCardView/TripCardView.tsx)：

- Props 新增 `toolsStarted?: ToolName[]` 与 `fallbackNarrative?: string`。
- 内部计算：

  ```ts
  // ⚠️ 必须用 hero / recommendation 判定，不能用整个 progressiveCard，
  // 否则 weather-only 流的 card_weather 会让 progressiveCard 存在，误判为完整流。
  const cardFlow = !!(card || progressiveCard?.hero || progressiveCard?.recommendation);
  const startedWeather = toolsStarted?.includes('getWeather') ?? false;
  const startedAttractions = toolsStarted?.includes('getAttractions') ?? false;

  const showHero          = !!heroData            || cardFlow;
  const showWeather       = !!weatherData         || startedWeather    || cardFlow;
  const showAttractions   = !!attractionItems     || startedAttractions || cardFlow;
  const showRecommendation = !!recommendationData || cardFlow;
  const showChips         = !!chips               || cardFlow;
  ```

- `show*` 为 false 时整段 JSX 跳过，不留 DOM 也不留骨架。
- `WeatherCard` 的 `summary` 取 `card?.weather?.summary ?? progressiveCard?.weather?.summary ?? fallbackNarrative`。

| 场景 | toolsStarted | cardFlow | 实际渲染 |
| --- | --- | --- | --- |
| 仅 `getWeather` | `['getWeather']` | false | WeatherCard ✅ |
| `getWeather` + `getAttractions`，未进 finalize | `['getWeather','getAttractions']` | false | WeatherCard + AttractionList |
| 完整 TripCard 流 | 同上 | true（hero/recommendation 到达） | 全套 5 块（含骨架） |
| 闲聊 | `[]`，`hasToolStart=false` | false | ChatPage 走 markdown 兜底，不进 TripCardView |

### 改动 3：ChatPage —— 透传 props 与计算 fallbackNarrative

修改 [apps/web/src/chat/ChatPage/ChatPage.tsx](apps/web/src/chat/ChatPage/ChatPage.tsx)：

- 给 TripCardView 透传 `toolsStarted` 与 `fallbackNarrative`。
- `inCardFlow` 判定同样收紧为 `!!(message.card || message.progressiveCard?.hero || message.progressiveCard?.recommendation)`。
- `fallbackNarrative` 仅在"未进入完整流 + `toolsStarted` 只有 `getWeather`"时取 `message.content`，作为 WeatherCard 整体评估的兜底文案。完整流场景永远不会污染。

> 实际短路上线后 `card_weather.weather.summary` 一定有值，`fallbackNarrative` 主要兜底极端场景（summary 缺失），保留无副作用。

### 改动 4：后端短路 LLM 续流（在原计划基础上追加）

仅前端裁剪还无法节省后端的 LLM 续流：weather-only 时 LLM 在 `finalizeTripWeather` 之后仍会输出几十条 token。`card_weather` 已经包含完整 7 日数据 + summary，再让 LLM 续写就是浪费。

#### 改动 4.1：state 增加短路标志

[apps/server/src/routes/chat/types.ts](apps/server/src/routes/chat/types.ts) 的 `ChatStreamState` 加：

```ts
weatherOnlyShortCircuit: boolean; // 默认 false
```

#### 改动 4.2：handleFinalizeTripWeatherEnd 设标志

[apps/server/src/routes/chat/handlers.ts](apps/server/src/routes/chat/handlers.ts) 在 emit `card_weather` 之后：

```ts
// 完整 TripCard 流里 finalizeTripWeather 跑到时 destinationEmitted 必为 true
// （prompt 强制 step2 destination → step3 weather），不会被误判。
if (!state.destinationEmitted && !state.cachedAttractions) {
  state.weatherOnlyShortCircuit = true;
  state.finalContent = weather.summary;
}
```

两个守卫条件等价于"无完整流前置步骤"：
- `!destinationEmitted` — `finalizeTripDestination` 没跑过
- `!cachedAttractions` — `getAttractions` 也没成功返回（双保险）

#### 改动 4.3：route.ts 主循环 break + abort

[apps/server/src/routes/chat/route.ts](apps/server/src/routes/chat/route.ts)：

```ts
for await (const event of agentStream ...) {
  ...
  if (event.event === "on_tool_end") {
    handleToolEnd(event, state, ...);
  }
  if (state.weatherOnlyShortCircuit) break;
}

// 主动 abort 上游 LangGraph stream，避免后台 LLM 续写继续烧 token
if (state.weatherOnlyShortCircuit && !abortController.signal.aborted) {
  abortController.abort();
}

// 自然收尾 OR 短路 都需要补 final + done；客户端断连仍由 sseLifecycle 区分
if (state.weatherOnlyShortCircuit || !abortController.signal.aborted) {
  emitEvent("final", { content: state.finalContent });
  emitEvent("done", {});
}
```

边界：
- `getWeather` 失败 → `finalizeTripWeather` 通常被跳过；即便被调用也会因 `state.cachedWeather` 缺失走 `跳过 card_weather` 分支，`weatherOnlyShortCircuit` 不置位，回退到原 LLM 续流。
- 用户主动断连 → `abortController.signal.aborted` 已为 true，标志不影响 catch 走 abort 分支。

## 实际修改文件

前端：

- [apps/web/src/chat/useTravelAgent.ts](apps/web/src/chat/useTravelAgent.ts)
- [apps/web/src/chat/cards/TripCardView/TripCardView.tsx](apps/web/src/chat/cards/TripCardView/TripCardView.tsx)
- [apps/web/src/chat/ChatPage/ChatPage.tsx](apps/web/src/chat/ChatPage/ChatPage.tsx)

后端：

- [apps/server/src/routes/chat/types.ts](apps/server/src/routes/chat/types.ts)
- [apps/server/src/routes/chat/handlers.ts](apps/server/src/routes/chat/handlers.ts)
- [apps/server/src/routes/chat/route.ts](apps/server/src/routes/chat/route.ts)

shared 类型 / 子卡组件 / agent prompt 不动。

## 验证

1. `pnpm --filter @travel/server dev` + `pnpm --filter @travel/web dev`。
2. 浏览器跑三条用例：
   - **仅天气**："查询一下北京的天气" → SSE 应在 `card_weather` 之后立刻 `final` + `done`，**没有**几十条后续 token；UI 上只渲染一张 WeatherCard，`整体评估` 来自 card_weather.summary。
   - **完整行程**："帮我规划一下杭州两日游" → 流程不变：`tool_start/end(getWeather)` + `tool_start/end(getAttractions)` + `card_destination` + `card_weather` + `card_attractions_summary` + tokens（空字符串收尾）+ `final` + `done`；UI 5 块 + chips 渐进显示。
   - **闲聊**："你好" → 直接 token + final，无 card / tool 事件，UI markdown 气泡兜底。
3. typecheck：
   - `pnpm --filter @travel/web typecheck`
   - `pnpm --filter @travel/server typecheck`
