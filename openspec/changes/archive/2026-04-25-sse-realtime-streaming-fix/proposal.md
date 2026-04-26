## Why

- 当前问题或机会：
  - DevTools EventStream 面板里所有 SSE 事件时间戳完全相同（`23:09:49.736` × 7 条），UI 表现为四张卡瞬间一次性出现，没有"骨架 → 裸数据 → narrative"的渐进效果。
  - 用户预期是：`tool_start:getWeather` 立刻骨架；`tool_end:getWeather` 填天气；`card` 填总结。
- 为什么现在要做：
  - 后端 PRD §6 已明确"每个工具执行完毕立即下发原始结果，不等 finalizeTripCard"，但运行时被 TCP 层 Nagle 算法打包破坏。属于阻断核心交互体验的问题。
- 如果不做会怎样：
  - 流式 UI 形同虚设；用户感知与一次性返回无差别；浪费了后端逐帧分散下发的设计。

## What Changes

- `apps/server/src/routes/chat.ts`：
  - 删除 `import { PassThrough } from "node:stream"`，移除 `const stream = new PassThrough()`。
  - 把 `ctx.body = stream; ctx.respond = true` 改为 `ctx.respond = false`，自接管 `ctx.res`。
  - 显式 `ctx.res.setHeader(...)` 设置 SSE 响应头并 `ctx.res.flushHeaders()`。
  - **关键**：在 `flushHeaders()` 之后调用 `ctx.res.socket?.setNoDelay(true)`，关闭 Nagle 算法。
  - `emitEvent` 直接 `writeEvent(ctx.res, ...)` 写到 http.ServerResponse。
  - 所有出口（finally / abort 回调）都加 `if (!ctx.res.writableEnded) ctx.res.end()` 自管收尾。

## Capabilities

### New Capabilities

- `sse-streaming`: 沉淀 `/api/chat` SSE 流式输出的实时性约束（逐帧不缓冲、Nagle 必须关、绕过 PassThrough）。

### Modified Capabilities

- 无（SSE 实时性首次正式沉淀）。

### Removed Capabilities

- 无。

## Impact

- Affected workspaces:
  - `apps/server`: 仅 `routes/chat.ts`。
  - `apps/web`: 不变（前端 reducer 已经按事件即时 patch）。
  - `packages/shared`: 不变。
- Affected APIs / protocols:
  - SSE 帧时序：从"全部聚集到响应末尾"改为"逐帧实时下发"，客户端语义不变。
- Compatibility impact:
  - 完全向后兼容；仅修复延迟问题。
- Risks:
  - `ctx.respond = false` 后必须自己 `res.end()`，所有出口都必须覆盖；遗漏会导致响应 hang。已在 finally + abort 回调里全覆盖。
  - 高并发下大量小 TCP 包可能增加网卡 syscall——但 SSE 场景下事件总量很少（10 条以内），无需担心。
- Rollback:
  - 单独回退此 change：恢复 PassThrough；事件会再次被 Nagle 打包。
- Docs to update:
  - `questions/SSE 事件被打包成同一 TCP 包导致卡片同时弹出.md`：本 change 与该排障文档同源，文档已沉淀。
