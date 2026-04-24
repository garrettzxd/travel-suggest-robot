# Vite 代理下 Chrome DevTools EventStream 面板为空

## 问题表现

- 本地开发环境：前端 `http://localhost:5173`（Vite dev server）→ 经 proxy 转发到后端 Koa `http://localhost:3001/api/chat`。
- 接口功能正常：SSE token 流能实时到达前端，消息逐字渲染的动画也在工作。
- 但 Chrome DevTools 选中这次 chat 请求 → **EventStream** 面板里**没有任何行**（ID/类型/数据三列全空）。
- 对比 `https://www.qianwen.com/chat` 的同类 POST SSE 接口，EventStream 面板能正常列出每条 `message` 事件。

## 本次最终定位

- 直接请求后端 `http://localhost:3001/api/chat` 时，响应头里可以稳定看到 `Content-Type: text/event-stream; charset=utf-8`，说明 **Koa chat 路由本身是正确的**。
- 通过 `http://localhost:5173/api/chat` 走 Vite proxy 时，响应 body 仍然是流式的，但浏览器最终拿到的响应头里**缺失 `Content-Type`**，因此 DevTools 不会切出 EventStream 面板。
- 这说明问题不在 server 层 SSE 协议实现，而在 **Vite 代理层提前 flush 响应头，导致上游 SSE 头没有及时写回浏览器**。

## 问题原因

**不是服务端协议问题**，排查结论如下：

1. **响应头完全符合 SSE 规范**
   - `Content-Type: text/event-stream; charset=utf-8`
   - `Transfer-Encoding: chunked`
   - `Cache-Control: no-cache`
   - `X-Accel-Buffering: no`
   - 没有 `Content-Encoding`（响应未被压缩）。
2. **SSE 帧格式正确**：`event: xxx\ndata: {...}\n\n`。
3. **关键差异**：把前端 fetch 改成直连 `http://localhost:3001/api/chat`（绕过 Vite 代理），EventStream 面板**立刻有行**。

所以根因是 **Vite dev server 的 HTTP proxy 转发行为**破坏了 Chrome 网络层识别 SSE 的启发式。进一步确认后，当前版本里还有一个更具体的问题：

- `proxy.on('proxyRes', ...)` 触发时，`http-proxy` **还没把上游响应头拷贝到浏览器响应对象**。
- 如果这时直接 `res.flushHeaders()`，浏览器拿到的会是一个**没有 `Content-Type: text/event-stream` 的 chunked 响应**。
- 结果就是：
  - 业务上仍然能读到流；
  - 但 DevTools 不会把它识别成 EventStream；
  - Network 面板里通常只剩普通“响应/十六进制”视图。

- Vite 使用 `http-proxy` 转发上游响应。Node 的 TCP socket 默认开启 Nagle 算法，会把上游多次 `res.write(chunk)` 攒成更大的包再下发给浏览器。
- 响应头也可能不会在第一时间 flush 到浏览器。
- 当浏览器看到的不是"持续小 chunk 的渐进式推送"、而是"延迟后一次到达的一坨"，Chrome DevTools 就不把它标记为 SSE 流，EventStream 面板因此为空。
- 注意：功能层面前端用 `fetch().body.getReader()` 仍能正确解析，所以业务不受影响，只是 DevTools 的调试体验打折。

qianwen 走的是真实网关 / nginx，没有这层 dev proxy，所以直接可见。

## 解决方法

在 Vite 的 proxy `configure` 钩子里，对 SSE 响应**先手动回写关键上游响应头，再关闭 Nagle 并立刻 flush 头**。

[apps/web/vite.config.ts](../apps/web/vite.config.ts)：

```ts
server: {
  port: 5173,
  proxy: {
    '/api': {
      target: 'http://localhost:3001',
      changeOrigin: true,
      ws: false,
      // 不给 SSE 设超时，避免代理主动断流。
      proxyTimeout: 0,
      timeout: 0,
      configure: (proxy) => {
        proxy.on('proxyRes', (proxyRes, _req, res) => {
          const contentType = proxyRes.headers['content-type'];
          if (typeof contentType === 'string' && contentType.includes('text/event-stream')) {
            // `proxyRes` 触发时，上游头还没自动拷到浏览器响应对象上。
            // 先把 SSE 识别所需的关键头补上，再提前 flush。
            res.statusCode = proxyRes.statusCode ?? res.statusCode;
            res.setHeader('Content-Type', contentType);

            const cacheControl = proxyRes.headers['cache-control'];
            if (cacheControl !== undefined) {
              res.setHeader('Cache-Control', cacheControl);
            }

            const xAccelBuffering = proxyRes.headers['x-accel-buffering'];
            if (xAccelBuffering !== undefined) {
              res.setHeader('X-Accel-Buffering', xAccelBuffering);
            }

            // 关闭 Nagle，让每个 chunk 立即下发；flushHeaders 让响应头先出去。
            // 否则 Chrome DevTools 不会把响应识别为 EventStream，面板为空。
            res.socket?.setNoDelay(true);
            res.flushHeaders();
          }
        });
      },
    },
  },
},
```

### 要点

- 修复的核心不是改 Koa chat 接口，而是修正 **Vite proxy 对 SSE 响应头的转发时序**。
- `res.setHeader('Content-Type', contentType)`：关键修复。否则 `flushHeaders()` 太早触发时，浏览器看不到 `text/event-stream`。
- `setNoDelay(true)`：关闭 TCP Nagle，上游 write 一到就下发，恢复"持续推流"形态，Chrome 识别为 SSE。
- `flushHeaders()`：让已经补齐的响应头在 body 第一个 chunk 之前到达浏览器，DevTools 能更早判定响应类型。
- `proxyTimeout: 0` / `timeout: 0`：长对话避免被代理层超时断开（与 DevTools 识别无关，顺手修）。
- **仅对 `Content-Type: text/event-stream` 生效**，不影响普通 JSON 响应。
- **修改 `vite.config.ts` 不会 HMR，必须重启 Vite dev server** 才生效。

## 验证方式

1. 重启 `vite` 开发服务器。
2. 刷新前端页面（5173），发一条消息触发 `/api/chat`。
3. 先看 Response Headers，确认代理后的响应已经带上 `Content-Type: text/event-stream; charset=utf-8`。
4. DevTools → Network → 选中 chat 请求 → EventStream 面板应该能看到 `token` / `tool_start` / `tool_end` / `final` / `done` 等事件逐行出现。
5. 如果仍为空，可用 `curl -i -N --raw` 直接分别打 5173 和 3001，对比响应头是否一致、chunk 边界是否合并。

## 附带排除过的可能性

以下都被证明**不是根因**，仅记录避免后续重复排查：

- ❌ 响应没有 gzip 压缩（确认 `Content-Encoding` 头不存在）。
- ❌ Koa `ctx.body = stream` 没有覆盖 `Content-Type`（header 正确到达浏览器）。
- ❌ SSE 帧格式问题（格式完全符合 `event: / data: / \n\n`）。
- ❌ 浏览器不支持 POST SSE 的 EventStream 面板（qianwen 证伪）。
- ❌ 请求 `Accept` 头缺失（客户端已设 `Accept: text/event-stream`）。
