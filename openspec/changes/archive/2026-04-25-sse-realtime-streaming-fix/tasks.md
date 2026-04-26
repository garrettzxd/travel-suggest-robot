## 1. Shared / Protocol

- [x] 1.1 不涉及 shared 类型或 SSE 帧格式变更；改动只在传输时机层面。

## 2. Server

- [x] 2.1 `apps/server/src/routes/chat.ts`：删除 `import { PassThrough } from "node:stream"` 与 `const stream = new PassThrough()`。
- [x] 2.2 `apps/server/src/routes/chat.ts`：把 `ctx.body = stream; ctx.respond = true` 改为 `ctx.respond = false`，自接管 `ctx.res`。
- [x] 2.3 `apps/server/src/routes/chat.ts`：用 `ctx.res.setHeader(...)` 显式设置 Content-Type / Cache-Control / Connection / X-Accel-Buffering，并 `ctx.res.flushHeaders()`。
- [x] 2.4 `apps/server/src/routes/chat.ts`：在 `flushHeaders()` 之后立即 `ctx.res.socket?.setNoDelay(true)` 关闭 Nagle 算法。
- [x] 2.5 `apps/server/src/routes/chat.ts`：`emitEvent` 改为 `writeEvent(ctx.res, event, data)`；删除 `stream.destroyed / stream.writableEnded` 守卫，换为 `ctx.res.writableEnded / ctx.res.destroyed`。
- [x] 2.6 `apps/server/src/routes/chat.ts`：finally 与 abort 回调里加 `if (!ctx.res.writableEnded) ctx.res.end()`。

## 3. Web

- [x] 3.1 不涉及 web 改动；前端 reducer 已是事件即时 patch。

## 4. Validation

- [x] 4.1 `pnpm --filter @travel/server typecheck` 通过。
- [x] 4.2 浏览器 DevTools EventStream 时间戳分散，UI 三段渐进可观察。
- [x] 4.3 abort 路径验证：发请求中途关闭页面，server log 无 hang，正常输出 `客户端连接已断开`。

## 5. Documentation

- [x] 5.1 不影响 `plans/`。
- [x] 5.2 已沉淀 `questions/SSE 事件被打包成同一 TCP 包导致卡片同时弹出.md`。
- [x] 5.3 此 change 的 proposal/design/tasks/spec 一致。
