## ADDED Requirements

### Requirement: SSE 帧逐帧实时下发

`/api/chat` 的每个 SSE 事件必须在 server 端调用 `emitEvent` 后立即写入 TCP socket，浏览器侧应能观察到事件之间的真实时间差（与底层 LangGraph / 工具响应的延迟一致）。

#### Scenario: 多事件之间存在数百毫秒间隔

- **WHEN** server 在 `t=0` 推送 `tool_start:getWeather`，在 `t=500ms` 推送 `tool_end:getWeather`
- **THEN** 浏览器 DevTools EventStream 面板显示两条事件的时间戳差值约 500ms（误差 < 50ms）

### Requirement: 关闭响应 socket 的 Nagle 算法

server 在 `flushHeaders()` 之后必须显式调用 `ctx.res.socket?.setNoDelay(true)`，防止 Node TCP 默认的 Nagle 算法把多次小写攒成同一个包再下发。

#### Scenario: chat 路由初始化

- **WHEN** chat 路由开始处理一个 POST /api/chat 请求
- **THEN** 在第一次 `res.write` 之前已调用 `setNoDelay(true)`

### Requirement: 绕过 PassThrough 直写响应

SSE 响应必须 `ctx.respond = false` 自接管 `ctx.res`，`writeEvent` 直接写 `http.ServerResponse`，不得通过 PassThrough 等中间流。

#### Scenario: 第一帧到达时机

- **WHEN** server 在 LangGraph 第一个事件到达后立即 emitEvent
- **THEN** 该帧字节直接进 socket，无需经过任何 Node Stream pipe 的可读 → 可写 buffer

### Requirement: 自管响应收尾

`ctx.respond = false` 后所有响应出口（finally 分支、abort 回调）必须显式 `if (!ctx.res.writableEnded) ctx.res.end()`，不得依赖 Koa 自动收尾。

#### Scenario: 正常结束

- **WHEN** for-await 循环消费完所有 LangGraph 事件
- **THEN** finally 分支调用 `ctx.res.end()`，HTTP 响应正确关闭

#### Scenario: 客户端中途断开

- **WHEN** 浏览器关闭页面触发 `ctx.res.on('close')`
- **THEN** abort 回调调用 `controller.abort()` 并 `ctx.res.end()`（如果尚未结束），server 不留 hang
