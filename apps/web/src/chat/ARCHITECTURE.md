# `apps/web/src/chat` 架构说明

> 面向后续 AI / 协作者：在该目录内做修改前，请先阅读本文。
> 该目录承担**前端聊天页的所有状态管理与 SSE 流消费**，是用户输入到结构化卡片渲染之间的核心管道。

## 1. 模块全景

```
apps/web/src/chat/
├── ARCHITECTURE.md             ← 本文档
├── useTravelAgent.ts           ← 编排层（hook 入口，仅状态 + 生命周期）
├── types.ts                    ← TravelChatMessage / ToolTraceEntry
│
├── sse/
│   ├── parser.ts               ← SSE 帧解析：parseFrame / readSseFrames
│   └── eventHandlers.ts        ← 事件处理器注册表（★ 扩展点）
│
├── message/
│   ├── patch.ts                ← 不可变 patch 工具：patchAssistantMessage / patchProgressiveCard / tryBuildCardFromProgressive
│   └── history.ts              ← 历史摘要：summarizeAssistantTurn / toHistory
│
├── tool/
│   └── trace.ts                ← 工具轨迹：markToolDone / markRunningToolsAsError / normalizeAttractionsResult
│
├── ChatPage/                   ← 页面容器，消费 useTravelAgent 并按消息状态渲染卡片或 markdown
├── InputBar/ TopBar/           ← UI 组件
└── cards/                      ← 各类结构化卡片组件
    ├── DestinationHero/ WeatherCard/ AttractionList/ RecommendationPanel/
    ├── TripCardView/           ← TripCard 总组装
    ├── ItineraryCard/          ← 行程规划卡
    └── WelcomeCard/
```

### 职责分层（自顶向下）

| 层 | 模块 | 副作用 | 单元测试友好度 |
|---|---|---|---|
| 视图 | `ChatPage/`、`cards/` | DOM 渲染 | 组件级测试 |
| 编排 | `useTravelAgent.ts` | React state + AbortController | 集成测试 |
| 事件分发 | `sse/eventHandlers.ts` | 调用注入的 setter | 注入 mock setter 即可单测 |
| 纯逻辑 | `message/*`、`tool/trace.ts`、`sse/parser.ts` | 无 | 100% 纯函数 |
| 共享契约 | `packages/shared` | 无 | 类型 + 常量 |

> **规则**：纯逻辑层禁止依赖 React；事件处理器只通过注入的 ctx 修改状态；编排层不写业务规则。

---

## 2. 数据流

### 2.1 一次请求的全链路

```
用户提交输入
        │
        ▼
┌──────────────────────┐
│  useTravelAgent      │  ← 编排层
│  ─ abort 上一个请求  │
│  ─ append user/asst  │
│  ─ toHistory(baseMsgs)│
│  ─ postChat(body)    │
└──────────┬───────────┘
           ▼
   ReadableStream<Uint8Array>
           │
           ▼
┌──────────────────────┐
│  sse/parser.ts       │  ← 纯 I/O，无状态
│  readSseFrames →     │
│  {event, data}       │
└──────────┬───────────┘
           ▼
┌──────────────────────────────────────────────────┐
│  for await frame:                                 │
│    if event === 'done': break                     │
│    handler = sseEventHandlers[event]              │
│    handler?.(data, ctx)  ← ctx 注入 setter / ref │
│    if result === 'stop': return                   │
└──────────┬────────────────────────────────────────┘
           ▼
┌──────────────────────────────────────────────────┐
│  sse/eventHandlers.ts（★ 扩展点）                 │
│   token            → tokenBuffer + setMessages    │
│   tool_start       → setToolTrace + setMessages   │
│   tool_end         → setToolTrace +               │
│                       (weather/attractions slot)  │
│   card             → message.card                 │
│   card_destination ┐                              │
│   card_weather     ├ patchProgressiveCard →       │
│   card_attractions ┘ message.progressiveCard +card│
│   itinerary        → message.itinerary            │
│   transport (预留) → message.transport            │
│   food      (预留) → message.food                 │
│   final            → tokenBuffer = content        │
│   error            → 'stop'                       │
└──────────────────────────────────────────────────┘
           ▼
   React state 更新 → ChatPage 重渲染
```

### 2.2 事件 → 消息槽 映射表

| SSE 事件 | 写入字段 | 触发渲染分支 |
|---|---|---|
| `token` | `content`, `status='updating'` | markdown bubble（无工具时）|
| `tool_start` | `hasToolStart=true`, `toolsStarted+=name` | TripCardView 骨架 |
| `tool_end (getWeather)` | `weather` | WeatherCard 升级 |
| `tool_end (getAttractions)` | `attractions` | AttractionList 升级 |
| `card_destination` | `progressiveCard.hero` | DestinationHero |
| `card_weather` | `progressiveCard.weather` | WeatherCard 完整态 |
| `card_attractions_summary` | `progressiveCard.{attractions,recommendation,chips}` | AttractionList + RecommendationPanel |
| `card` | `card`（一次性完整 TripCard） | TripCardView 完整态 |
| `itinerary` | `itinerary` | ItineraryCard |
| `transport` *(预留)* | `transport` | 待实现 TransportCard |
| `food` *(预留)* | `food` | 待实现 FoodCard |
| `final` | `content`, `status='success'` | 终态 |
| `error` | `status='error'`，主循环停止 | 错误气泡 |
| `done` | 主循环 `break`，无 patch | — |

### 2.3 渐进式 TripCard 合成

后端按工具完成顺序下发三段 SSE，前端拼图聚合：

```
card_destination          → progressiveCard.hero
card_weather              → progressiveCard.weather
card_attractions_summary  → progressiveCard.{attractions,recommendation,chips}
                ↓
        tryBuildCardFromProgressive
                ↓
         字段齐备？──否──→ 保留 progressiveCard，骨架等待
                │ 是
                ▼
        合成完整 message.card → TripCardView 完整态
```

`patchProgressiveCard` 在每次局部到达时尝试合成，避免 `card` 与 `progressiveCard` 状态分裂。

---

## 3. 扩展指南

### 3.1 新增一种结构化卡片（推荐流程）

以"美食建议卡 `food`"为例，全流程 6 步：

1. **`packages/shared/src/travel.ts`**：定义 `FoodRecommendation` 等领域类型；
2. **`packages/shared/src/chat.ts`**：
   - `ToolName` 增加 `recommendFood`；
   - `StreamEvent` 增加 `{ type: 'food'; food: FoodRecommendation }`；
3. **`apps/web/src/chat/types.ts`**：在 `TravelChatMessage` 加 `food?: FoodRecommendation;`；
4. **`apps/web/src/chat/sse/eventHandlers.ts`**：
   ```typescript
   const handleFood: SseEventHandler = (data, ctx) => {
     const food = (data as { food?: FoodRecommendation }).food;
     if (!food) return;
     ctx.setMessages((prev) =>
       patchAssistantMessage(prev, ctx.assistantMessageId, { food }),
     );
   };
   // 在 sseEventHandlers 表里加：food: handleFood,
   ```
5. **`apps/web/src/chat/message/history.ts`** 的 `summarizeAssistantTurn`：补一段 fallback 摘要，避免下一轮 LLM 重复调工具；
6. **`apps/web/src/chat/cards/`** 新建卡片组件，并在 `ChatPage/MessageRow` 选择渲染分支。

> `useTravelAgent.ts` **零修改**。这是本次重构的核心收益：扩展不再修改主循环。

### 3.2 新增一种 SSE 事件（不一定是卡片）

只需 1 + 2 步：在 `StreamEvent` 加分支 → 在 `sseEventHandlers` 注册一个 handler。

### 3.3 修改某个事件的处理逻辑

在 `eventHandlers.ts` 找到对应 `handleXxx`，单点修改即可，不影响其它事件。

---

## 4. 设计要点（FAQ）

**为什么用注册表而不是 if/else？**
- 扩展时只动一处（注册表 + 新 handler）；
- 主循环不再因新事件膨胀；
- 未注册事件天然向后兼容（`handler?.(...)` 静默忽略）。

**为什么 `tokenBuffer` 用 ref 而不是 state？**
- token 处理器需要在多次 frame 间累加 delta；
- 用 state 会被异步批处理打断，丢字；
- ref 同步可写可读，且不触发额外渲染。

**为什么 `final` 事件覆盖 `tokenBuffer.current`？**
- 后端可能因截断 / 校正下发完整 content；以 final 为准更安全。

**为什么消息 patch 都走 `patchAssistantMessage`？**
- 统一按 id + role 过滤，避免误伤 user 气泡或并发请求里的旧消息；
- 所有 patch 入口集中后，加新副作用（如埋点、动画触发）只改一处。

**为什么 `progressiveCard` 与 `card` 同时存在？**
- `progressiveCard`：渲染中间态；
- `card`：完整态，给历史摘要 / 旧渲染路径用；
- `tryBuildCardFromProgressive` 在局部数据齐备时自动合成，两者不会撕裂。

**`error` 处理器为何返回 `'stop'`？**
- 错误事件后流可能仍有杂项数据；让主循环显式停止消费比静默继续更安全。

---

## 5. 测试策略建议

| 模块 | 推荐测试方式 |
|---|---|
| `sse/parser.ts` | 纯函数：构造 SSE 文本，断言 frame 序列 |
| `message/patch.ts`、`message/history.ts`、`tool/trace.ts` | 纯函数单测 |
| `sse/eventHandlers.ts` | 注入 mock setter / ref，断言被调用参数 |
| `useTravelAgent` | 组件级集成：mock `postChat` 返回构造的 ReadableStream |
| `ChatPage` 渲染分支 | 组件测试，覆盖 weather-only / TripCard / Itinerary / 错误态 |

---

## 6. 已知边界 & 注意事项

- **`baseMessages` 必须在请求发起时快照**：作为 history 输入，避免本轮新追加的 user/asst 进入历史造成重复。
- **`abortRef` 比对**：`finally` 里只有 `abortRef.current === controller` 才清空，避免快速连发请求时旧请求把新请求的 loading 状态清掉。
- **未注册事件**：当前主循环静默跳过未识别事件，新事件忘记注册会"看似无效"，调试时优先检查 `sseEventHandlers` 是否包含目标 key。
- **`done` 事件**：由主循环直接消费用于 `break`，不要把它注册到 handlers 表中。
- **不可变更新**：`patch.ts` / `trace.ts` 全部返回新数组 / 对象，禁止就地变更，否则 React 不会重渲染。
