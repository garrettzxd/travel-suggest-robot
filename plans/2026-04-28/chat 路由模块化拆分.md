# chat 路由模块化拆分

## Context

[apps/server/src/routes/chat.ts](apps/server/src/routes/chat.ts) 已经 711 行，承担了请求校验、SSE 生命周期、LangGraph 事件分发、工具结果归一化、TripCard 合并、降级路径兜底等多项职责。配套的 [chat.logger.ts](apps/server/src/routes/chat.logger.ts) / [chat.types.ts](apps/server/src/routes/chat.types.ts) 也散落在 `routes/` 根目录。这带来两个问题：

1. **目录边界不清**：`routes/` 本应只放 HTTP 入口，目前混入了类型、日志、私有工具，未来新增 `/api/foo` 时无处摆放新增模块的辅助文件。
2. **单文件过大**：chat.ts 700+ 行多职责堆叠，多人改动同一个文件极易冲突；模型事件处理、工具结果合并、SSE 控制本应解耦。

目标：把 chat 相关代码统一收口到 **`apps/server/src/routes/chat/`** 子目录，按"能力类型"切成多个 ~50–150 行的小文件，主入口 `index.ts` 只做装配。`routes/` 根目录恢复为只放接口入口的状态。

## 目标目录结构

```
apps/server/src/routes/
├── chat/
│   ├── index.ts                # 唯一对外出口：export { chatRoute }
│   ├── route.ts                # chatRoute Koa handler（精简后的主编排，~120 行）
│   ├── types.ts                # ChatRequestSchema + EventWriter + ToolCall + LangChainStreamEvent + ChatStreamState
│   ├── logger.ts               # ChatRouteLogger / createChatLogger / previewText / previewJson（原 chat.logger.ts 平移）
│   ├── messages.ts             # historyToAgentMessages
│   ├── streamParsers.ts        # extractTextDelta / normalizeToolPayload / extractToolResult
│   ├── toolMeta.ts             # toolLabel / isPublicToolName / isFinalizeInput / isRecommendItineraryInput
│   ├── tripCard.ts             # buildTripCard
│   ├── sseLifecycle.ts         # initSseResponse(ctx) + createEventEmitter(ctx, log)
│   ├── handlers.ts             # handleModelStream / handleToolStart / handleToolEnd（含 finalize / itinerary / public tool 子分支）
│   └── legacyUpdatesEmitter.ts # emitToolStarts / emitToolEnds（updates 模式降级路径，主链路不引用，文件顶部注释说明）
└── response.json               # 已存在的旧文件保持不动
```

需删除的旧文件：

- [apps/server/src/routes/chat.ts](apps/server/src/routes/chat.ts)
- [apps/server/src/routes/chat.logger.ts](apps/server/src/routes/chat.logger.ts)
- [apps/server/src/routes/chat.types.ts](apps/server/src/routes/chat.types.ts)

外部引用更新：

- [apps/server/src/app.ts:10](apps/server/src/app.ts) `import { chatRoute } from "./routes/chat.js"` → `import { chatRoute } from "./routes/chat/index.js"`。
- [apps/server/src/agent/tools/finalizeTripCard.ts:3](apps/server/src/agent/tools/finalizeTripCard.ts) 注释里的路径引用同步改为 `apps/server/src/routes/chat/handlers.ts`。

## 各模块职责

### `chat/types.ts`
- 平移现有 `ChatRequestSchema`、`StreamMetadata`、`ToolCall`、`EventWriter`。
- 把 chat.ts 顶部的 `LangChainStreamEvent` 接口搬过来。
- 新增 `ChatStreamState`：把当前 `chatRoute` 内部维护的可变集合 / 缓存 / 标志位收口成一个结构，供 handlers 共享。

```ts
export interface ChatStreamState {
  startedToolCalls: Set<string>;
  completedToolCalls: Set<string>;
  emittedPublicTools: Set<ToolName>;
  emittedToolStartRunIds: Set<string>;
  cardEmitted: boolean;
  itineraryEmitted: boolean;
  cachedWeather: WeatherSnapshot | undefined;
  cachedAttractions: Attraction[] | undefined;
  finalContent: string;
}
```

### `chat/logger.ts`
- chat.logger.ts 整体平移，导出保持不变（`createChatLogger` / `ChatRouteLogger` / `previewText` / `previewJson`）。

### `chat/messages.ts`
- 平移 `historyToAgentMessages`，原注释保留。

### `chat/streamParsers.ts`
- 平移 `extractTextDelta`、`normalizeToolPayload`、`extractToolResult`。三者都是把 LangChain 异构输入归一化的纯函数，归在一起。

### `chat/toolMeta.ts`
- 平移 `toolLabel`、`isPublicToolName`、`isFinalizeInput`、`isRecommendItineraryInput`。这些都是工具名 / 工具结果的元信息判定，纯函数。

### `chat/tripCard.ts`
- 平移 `buildTripCard`（含原注释）。

### `chat/sseLifecycle.ts`
- 抽取 chat.ts 现有的 SSE 响应初始化与 emitter 工厂逻辑：

```ts
// 设置 SSE 响应头、关闭 Nagle、绑定生命周期监听，返回拆解函数
export function initSseResponse(ctx, abortController, log): { dispose: () => void };

// 工厂方法：返回 EventWriter；内部维护 sseEventCount。
export function createEventEmitter(ctx, log): EventWriter;
```

- `initSseResponse` 内部完成：`ctx.respond=false`、headers、`flushHeaders`、`socket.setNoDelay(true)`、`req`/`res` close 监听绑定与解绑。
- `createEventEmitter` 内部完成：`writableEnded` / `destroyed` 检查、调用 `writeEvent`、写入日志。

### `chat/handlers.ts`
- 三个公共 handler，签名都是 `(event, state, deps) => void`，`deps = { emitEvent, log }`：
  - `handleModelStream(event, state, deps)`：处理 `on_chat_model_stream`，累加 `state.finalContent`，emit `token`。
  - `handleToolStart(event, state, deps)`：处理 `on_tool_start`，含内部工具跳过、`isPublicToolName` 守卫、单轮去重（`emittedPublicTools`）、`startedToolCalls` / `emittedToolStartRunIds` 维护。
  - `handleToolEnd(event, state, deps)`：处理 `on_tool_end`，按 `event.name` 分派到三个内部分支函数：
    - `handleFinalizeTripCardEnd` → 调用 `tripCard.buildTripCard`，emit `card`。
    - `handleRecommendItineraryEnd` → emit `itinerary`。
    - `handlePublicToolEnd` → 写 cache + emit `tool_end`。

  内部分支函数留在同一个 `handlers.ts` 文件以保持事件分派的可读性；如果未来扩展更多内部工具再按需拆。

### `chat/legacyUpdatesEmitter.ts`
- 平移 `emitToolStarts` / `emitToolEnds`。
- 文件顶部添加注释明确"当前未被主链路引用，保留作为 LangGraph updates 模式降级路径的预留实现"。
- 主入口 `route.ts` 不 import 它；只在测试或未来切流时按需启用。

### `chat/route.ts`
- 精简后的 Koa handler，只做编排：

```ts
export async function chatRoute(ctx: Context): Promise<void> {
  const log = createChatLogger();
  const startedAt = Date.now();

  const parsed = ChatRequestSchema.safeParse(ctx.request.body ?? {});
  if (!parsed.success) { /* 400 早返 */ return; }

  const input: ChatRequest = parsed.data;
  const abortController = new AbortController();
  const state: ChatStreamState = createInitialState();

  const emitEvent = createEventEmitter(ctx, log);
  const { dispose } = initSseResponse(ctx, abortController, log);

  try {
    log.request(previewText(input.message));
    log.llmCall({ ... });

    const agentStream = agent.streamEvents(
      { messages: historyToAgentMessages(input.history, input.message) },
      { signal: abortController.signal, version: "v2" },
    );

    for await (const event of agentStream as AsyncIterable<LangChainStreamEvent>) {
      if (abortController.signal.aborted) break;

      if (event.event === "on_chat_model_stream") {
        handleModelStream(event, state, { emitEvent, log });
        continue;
      }
      if (event.event === "on_tool_start") {
        handleToolStart(event, state, { emitEvent, log });
        continue;
      }
      if (event.event === "on_tool_end") {
        handleToolEnd(event, state, { emitEvent, log });
      }
    }

    if (!abortController.signal.aborted) {
      log.llmResult(previewText(state.finalContent));
      emitEvent("final", { content: state.finalContent });
      emitEvent("done", {});
    }
  } catch (error) { /* 同现状的 abort 区分 + emit error/done */ }
  finally {
    dispose();
    if (!ctx.res.writableEnded) ctx.res.end();
  }
}
```

- 这样 `route.ts` 控制在 ~120 行；任何 handler / parser / tripCard 的修改都不会再触动主入口。

### `chat/index.ts`
- 单行 barrel：`export { chatRoute } from "./route.js";`

## 关键约束

- **零行为变更**：本次纯重构，所有事件 emit 顺序、去重逻辑、日志文案、SSE 头与 `setNoDelay` 行为必须与 chat.ts 当前实现完全一致。state 改成集中对象后，原本的 `let cardEmitted = false` 等在赋值点（handlers）改写成 `state.cardEmitted = true`。
- **注释保留**：chat.ts 大量内联注释（特别是 LLM 重复调用、Nagle、updates vs streamEvents 区分、cache 抑制等）必须随函数搬到新文件，遵守 [CLAUDE.md](CLAUDE.md) "每个函数必须有注释"规则。
- **导入路径用 `.js` 结尾**：仓库现有 ESM 风格统一带 `.js`，新建文件之间互引用也按此惯例。
- **不引入新依赖**：本次只是文件切分 + 引用调整。
- **legacyUpdatesEmitter.ts 不被主链路引用**：仍保留 export 与原注释，避免 dead code 检查报错的同时清晰标注其降级用途。

## 验证

1. **类型检查**：`pnpm --filter @travel/server exec tsc --noEmit` 必须通过；预期会捕捉所有未更新的 import 路径。
2. **构建**：`pnpm --filter @travel/server build`（如项目配置）确保 dist 产物路径可解析。
3. **运行联调**：
   - `pnpm --filter @travel/server dev` 启动后端；
   - `pnpm --filter @travel/web dev` 启动前端；
   - 浏览器发起一条会触发 `getWeather` + `getAttractions` + `finalizeTripCard` 的消息（如 "推荐北京周末行程"），观察：
     - SSE 事件类型 / 顺序与重构前一致（`tool_start` × 2 → `tool_end` × 2 → `card` → `final` → `done`）；
     - DevTools EventStream 中事件时间戳之间仍有真实间隔（确认 `setNoDelay` 仍生效）；
     - 触发 `recommendItinerary` 路径（如 "帮我规划三天行程"），确认 `itinerary` 事件正常下发；
     - 触发同名工具被 LLM 重复调用的边界（依赖现有 prompt 行为，无需特意构造）也按原 dedup 策略静默丢弃。
4. **后端日志比对**：复跑同一条消息，`【接收请求】/【调用大模型】/【调用XX工具】/【XX返回】/【大模型返回】` 日志结构与原版一致。

## 关键改动文件清单

- 新增：`apps/server/src/routes/chat/{index,route,types,logger,messages,streamParsers,toolMeta,tripCard,sseLifecycle,handlers,legacyUpdatesEmitter}.ts`
- 删除：`apps/server/src/routes/chat.ts`、`apps/server/src/routes/chat.logger.ts`、`apps/server/src/routes/chat.types.ts`
- 修改：`apps/server/src/app.ts`（import 路径）、`apps/server/src/agent/tools/finalizeTripCard.ts`（注释里的路径引用）
- 同步更新：`CLAUDE.md` "项目结构索引" 中 `apps/server/src/routes/` 描述（`chat.ts` 改为 `chat/`），保持索引与实际目录一致。
