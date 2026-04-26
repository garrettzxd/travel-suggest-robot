# SSE 事件被打包成同一 TCP 包导致卡片同时弹出

## 问题表现

- 本地开发环境：前端 `http://localhost:5173`（Vite dev）→ `/api/chat` proxy → 后端 Koa `http://localhost:3001/api/chat`。
- 在浏览器 DevTools → Network → 选中 `/api/chat` → **EventStream** 面板里，单次 chat 请求虽然能看到 7 条事件（`tool_start` × 2、`tool_end` × 2、`card`、`final`、`done`），但**所有事件的"时间"列完全一致**：
  ```
  tool_start  getWeather       23:09:49.736
  tool_start  getAttractions   23:09:49.736
  tool_end    getAttractions   23:09:49.736
  tool_end    getWeather       23:09:49.736
  card        ...              23:09:49.736
  final       {"content":""}   23:09:49.736
  done        {}               23:09:49.736
  ```
- UI 表现：四张卡（地点 / 天气 / 景点 / 出行建议）**没有任何骨架阶段，整套卡片瞬间一次性出现**。预期是 Hero / Weather / Attractions / Recommendation 按工具完成顺序逐张升级（`tool_end:getAttractions` → 景点先填、`tool_end:getWeather` → 天气填、`card` → narrative 补齐），而实际是请求结束那一瞬间所有卡片同时切到完整态。
- 业务功能正常：数据正确、事件类型正确、最终渲染正确，**只是没有时间差**。

## 问题原因

按证据链定位：

1. **LangGraph 真实事件之间存在数百毫秒间隔，server 端发出时是分散的**。`agent.streamEvents({ version: "v2" })` 拉到的事件序列里：`tool_start:getWeather` 与 `tool_end:getWeather` 之间隔着一次 QWeather REST 调用（实测 ~500ms）；`tool_end:getAttractions` 与 `card`（finalizeTripCard）之间隔着 LLM 思考 + tool_call streaming（~1.5s）。所以 server 端 `emitEvent` 调用之间的时间差是真实存在的。

2. **但 EventStream 面板时间戳完全相同，说明这些 frame 被打到了同一个 TCP 包**。Chrome DevTools 的"时间"列展示的是该事件 frame 抵达浏览器并被解析的时刻；同一个 TCP 包内的多个 SSE frame 会同时被解析，时间戳就一致。

3. **根因 A：Node TCP socket 默认 Nagle 开启**。Node `net.Socket` 默认 `TCP_NODELAY=false`，即开启 Nagle 算法——内核会把短时间内的多次小写攒成一个 MSS 大小的包再发出，目的是减少小包数量。对常规 HTTP 响应（一次性 send 完）无影响；但 SSE 这种"逐帧推、每帧几十到几百字节"的模式就是灾难：Nagle 在等"下一次写攒到 MSS"或者"上一个 ACK 到达"才 flush；流式的写入节奏被它破坏。本仓库 [apps/server/src/routes/chat.ts](../apps/server/src/routes/chat.ts) 里之前没有任何 `setNoDelay` 调用。

4. **根因 B：PassThrough → Koa pipe 多了一层 buffer**。原实现把 frame 写到 `new PassThrough()`，再通过 `ctx.body = stream; ctx.respond = true` 让 Koa 内部 `stream.pipe(ctx.res)`。`pipe` 会把数据从 PassThrough 的可读端读出来再 `ctx.res.write`，期间穿过 readable / writable 的内部 buffer，flush 时机由 Node 流模块决定，不是写入即刻 flush。这一层 buffer 与 Nagle 叠加，让事件被进一步攒批。

5. **Vite proxy 侧已经做对了浏览器侧 socket 的 noDelay**：[apps/web/vite.config.ts:41](../apps/web/vite.config.ts:41) 在 `proxy.on('proxyRes')` 里调用了 `res.socket?.setNoDelay(true)`。但**上游 Koa → Vite 的 TCP 连接**才是真正的瓶颈：上游 server 已经把多个 frame 攒在一起送过来，proxy 即使及时下发也只能整包下发。

第三方行为补充：

- LangGraph `streamEvents` 本身**不会**额外缓冲事件，每个底层 chat model / tool 事件会立刻 yield。可以在 [apps/server/src/routes/chat.ts:467](../apps/server/src/routes/chat.ts:467) 那个 `for await (const event of agentStream)` 里 `Date.now()` 打日志验证：`tool_end:getAttractions` 与 `tool_end:getWeather` 进入循环的时间确实有 ~300ms 间隔。
- Chrome DevTools 的 EventStream 面板**不会**主动补帧时间戳，它就是按"该 SSE frame 解析出来的瞬间"打时间。这是判断"server 是不是真的逐帧 flush"的可靠观察口。

## 解决方法

[apps/server/src/routes/chat.ts](../apps/server/src/routes/chat.ts) 三处协同改造，对症修两个根因：

1. **接管 ctx.res，绕过 PassThrough**。原 `ctx.body = stream; ctx.respond = true` 改成 `ctx.respond = false` 后直接操作 `ctx.res`：
   ```ts
   ctx.respond = false;
   ctx.res.statusCode = 200;
   ctx.res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
   ctx.res.setHeader("Cache-Control", "no-cache");
   ctx.res.setHeader("Connection", "keep-alive");
   ctx.res.setHeader("X-Accel-Buffering", "no");
   ctx.res.flushHeaders();
   ```
   连带删掉了文件头部的 `import { PassThrough } from "node:stream"`。

2. **关闭响应 socket 的 Nagle 算法**：
   ```ts
   ctx.res.socket?.setNoDelay(true);
   ```
   位置在 `flushHeaders()` 之后、第一次 `res.write` 之前——`flushHeaders()` 内部会确保 socket 已分配。

3. **emitEvent 直接写 ctx.res**：
   ```ts
   const emitEvent: EventWriter = (event, data) => {
     if (ctx.res.writableEnded || ctx.res.destroyed) { /* 跳过 */ }
     sseEventCount += 1;
     writeEvent(ctx.res, event, data);  // writeEvent 接收 Writable，http.ServerResponse 直接兼容
   };
   ```

4. **所有出口自管 res.end()**。`ctx.respond = false` 后 Koa 不会帮收尾，必须自己在 finally / abort 路径里：
   ```ts
   if (!ctx.res.writableEnded) {
     ctx.res.end();
   }
   ```

为什么不用更轻量的方案：

- 只加 `setNoDelay(true)` 而保留 PassThrough：能缓解但不彻底，PassThrough → pipe 之间仍有可观察到的 ~50ms 攒批。
- 给 PassThrough 加 cork/uncork：太脆弱，且不解决 Nagle。
- 改用 koa-sse 之类的中间件：库本身实现也是 setNoDelay + 直写 res，没有额外收益，反而引入依赖。

部署 / 验证步骤：server 端是 `tsc -b -w` 增量编译，**改完保存后 dev 进程会自动重启**；浏览器只要刷新一次就能看到新行为。

## 验证方式

1. 浏览器开 DevTools → Network 面板，发送 "我想去成都" 触发完整三工具链。
2. 选中 `/api/chat` → 切到 **EventStream** 面板。
3. 预期"时间"列**不再全是同一毫秒**，应当看到类似分布：
   ```
   tool_start  getWeather       23:09:49.736
   tool_start  getAttractions   23:09:49.737
   tool_end    getAttractions   23:09:50.123    ← Amap ~400ms 返回
   tool_end    getWeather       23:09:50.456    ← QWeather ~700ms 返回
   card        ...              23:09:51.890    ← LLM finalize ~1.5s
   final       {"content":""}   23:09:51.891
   done        {}               23:09:51.891
   ```
4. UI 上对应能看到三段渐进：
   - 0.0s 立即出 4 张全骨架卡；
   - ~0.4s 景点列表骨架切实数据，`description` 区域单独 loading；
   - ~0.7s 天气卡骨架切实数据，`summary` 区域单独 loading；
   - ~1.9s `card` 到达，hero / recommendation / chips 全部填入，景点 description 与天气 summary 补齐。
5. 备用观察口：在 [apps/server/src/routes/chat.ts](../apps/server/src/routes/chat.ts) 的 `for await` 循环里临时加 `console.log(Date.now(), event.event, event.name)`，对照 EventStream 时间戳，server 侧分散输出且 + 浏览器侧分散接收 = 修复成功；server 侧分散但浏览器仍同时刻 = 还有缓冲层未解决。

## 附带排除过的可能性

- ❌ **LangGraph 在 batch 事件**：实测在 `for await` 循环里打时间戳，server 侧确实是分散的。
- ❌ **客户端 fetch ReadableStream 在 batch**：前端 [apps/web/src/chat/useTravelAgent.ts](../apps/web/src/chat/useTravelAgent.ts) 的 `readSseFrames` 是逐 chunk 解码的，没有缓冲；现象表明 chunk 本身就是同时到达的，不是前端攒帧。
- ❌ **Vite proxy 单方面问题**：[apps/web/vite.config.ts](../apps/web/vite.config.ts) 已经在 `proxyRes` 里 `setNoDelay(true)`，但这是**浏览器侧** socket；上游 Koa→Vite 的 socket 才是瓶颈。绕过 Vite 直连 `http://localhost:3001/api/chat` 看 EventStream 仍然全是同一时间戳，就能确认问题在 Koa server 自身。
- ❌ **Koa 缺少某个 SSE 中间件**：本仓库 [apps/server/src/app.ts](../apps/server/src/app.ts) 只挂了 logger / cors / bodyParser，没有 compression 等会缓冲响应的中间件，可以排除中间件因素。
