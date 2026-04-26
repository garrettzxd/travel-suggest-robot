## Context

- 现状：
  - chat.ts 用 `PassThrough` 作中间流，`ctx.body = stream; ctx.respond = true`，由 Koa 内部 `stream.pipe(ctx.res)` 转发。
  - `emitEvent` 调用 `writeEvent(stream, ...)` 写 PassThrough。
  - Vite proxy 已在 [apps/web/vite.config.ts:41](apps/web/vite.config.ts:41) 对**浏览器侧** socket 调用 `setNoDelay(true)`。
  - 但 Koa 自己的响应 socket 没有任何 noDelay 调用，Node TCP 默认 Nagle=on。
- 本次变更入口：
  - 用户报告 EventStream 时间戳全部相同；UI 卡片瞬间弹出。
- 现有限制：
  - 不能改 SSE 协议或前端 reducer（前端已经是事件即时 patch）。
  - 不能引入 koa-sse 之类新依赖。

## Goals / Non-Goals

**Goals:**

- 每个 `emitEvent` 调用对应一次立即下发的 TCP 写，浏览器侧 EventStream 时间戳分散反映真实事件间隔。
- 保持现有 SSE 协议、事件类型、前端消费逻辑完全不变。

**Non-Goals:**

- 不优化 LangGraph 事件流本身。
- 不引入压缩 / HTTP/2 / WebSocket。

## Affected Layers

- `packages/shared`:
  - 无。
- `apps/server`:
  - 仅 `routes/chat.ts`。
- `apps/web`:
  - 无。

## Decisions

### 1. 绕过 PassThrough，直写 ctx.res

- Decision:
  - `ctx.respond = false` 自接管 `ctx.res`；`writeEvent` 直接写 http.ServerResponse。
- Rationale:
  - PassThrough → pipe 多一层 buffer + flush 时机不可控；SSE 这种逐帧推送场景应当最少层数。
- Rejected alternatives:
  - 给 PassThrough 配 cork/uncork：太脆弱。
  - 写 koa-sse 中间件：库内部本质也是 setNoDelay + 直写 res，没有额外收益。

### 2. setNoDelay(true) 必须在 flushHeaders 之后

- Decision:
  - 顺序：`flushHeaders()` → `setNoDelay(true)` → 第一次 `res.write`。
- Rationale:
  - `flushHeaders()` 内部确保 socket 已分配；过早调用 `setNoDelay` 在某些 Node 版本下 socket 可能尚未存在。
- Rejected alternatives:
  - 在 `proxy.on('proxyRes')` 那种回调里设置：那是 Vite 的浏览器侧 socket，与 Koa 上游 socket 无关。

### 3. 自管 res.end

- Decision:
  - 所有出口（finally / abort 回调 / error 回调）都加 `if (!ctx.res.writableEnded) ctx.res.end()`。
- Rationale:
  - `ctx.respond = false` 后 Koa 不再自动收尾，遗漏会导致响应 hang。

### Data Flow / Responsibility

- 请求入口：
  - `agent.streamEvents` → `for await (event of agentStream)` → `emitEvent(name, payload)` → `writeEvent(ctx.res, ...)` → `res.write(Buffer)` → 直接进 socket（noDelay 已开）→ Vite proxy 转发 → 浏览器。
- 数据返回：
  - 每个事件作为独立 TCP 写，立即可达浏览器；前端 `useTravelAgent` 按事件即时 patch state。
- 职责边界：
  - chat.ts 负责"逐帧 + 不缓冲"；前端不感知传输层。

### Compatibility / Migration

- 是否有字段兼容问题：无；SSE 帧格式不变。
- 是否需要迁移旧数据：无。
- 是否需要重启 dev server：是，server 改动需要重编。

## Validation Plan

- 类型检查：`pnpm --filter @travel/server typecheck` 通过。
- 手工验证：
  - 浏览器 DevTools → Network → /api/chat → EventStream 面板，时间戳应分散：
    ```
    tool_start  getWeather       23:09:49.736
    tool_start  getAttractions   23:09:49.737
    tool_end    getAttractions   23:09:50.123    ← Amap ~400ms
    tool_end    getWeather       23:09:50.456    ← QWeather ~700ms
    card        ...              23:09:51.890    ← finalize ~1.5s
    final                        23:09:51.891
    done                         23:09:51.891
    ```
  - UI 三段渐进可观察：0s 全骨架；~0.4s 景点切实；~0.7s 天气切实；~1.9s card 到达 hero/recommendation 填齐。

## Risks / Trade-offs

- 风险 1：自管 `res.end()` 漏覆盖 → 响应 hang。
  - 缓解：finally + abort 回调两处都加 `if (!writableEnded)` 守卫。
- 风险 2：禁用 Nagle 后小包数量增加。
  - 缓解：单次 SSE 流 < 20 帧，OS syscall 影响微乎其微。

## Documentation Sync

- 需要同步的 `plans/` 文档：无。
- 需要同步的 `questions/` 文档：
  - `questions/SSE 事件被打包成同一 TCP 包导致卡片同时弹出.md`（已与本 change 同步沉淀）。
