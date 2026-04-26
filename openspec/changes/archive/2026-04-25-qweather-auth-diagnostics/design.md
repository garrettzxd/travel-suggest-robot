## Context

- 现状：
  - QWeather JWT 鉴权遵循 EdDSA + header.kid（凭据 ID）+ payload.sub（项目 ID），实现在 `apps/server/src/agent/tools/qweatherAuth.ts`。
  - 业务调用走 `lookupQWeatherCity` → `qweatherFetch`；返回体里 `code !== "200"` 视为业务失败，但代码没校验就直接读 `json.location` / `json.daily`。
  - 401 鉴权失败时表现为 `Cannot read properties of undefined (reading 'map')` 之类的二级错误，根因被吞掉。
- 本次变更入口：
  - 用户报告"天气数据获取失败"，怀疑 JWT 配置有问题。需要把 QWeather 真实错误码透出来诊断。
- 现有限制：
  - 不能修改 JWT 签发逻辑——仓库审计已确认结构 100% 合规（alg=EdDSA / kid=KEY_ID / sub=PROJECT_ID / iat-30s / exp+900s）。
  - 不能引入新的依赖，沿用 `jose`。

## Goals / Non-Goals

**Goals:**

- 任意 QWeather 调用失败时，错误消息必须包含 HTTP status + QWeather code + 中文解释。
- 进程内首次签发 JWT 时打一行诊断日志，让人肉眼对照 .env 与控制台是否一致。
- 把 401/402/403 三类鉴权错误从普通错误中识别出来，附上"检查 kid/sub/host"提示。

**Non-Goals:**

- 不在 server 层做错误恢复或重试——一次失败就向前端透传。
- 不在前端做特殊鉴权失败 UI——继续走通用 error 气泡。

## Affected Layers

- `packages/shared`:
  - 无。
- `apps/server`:
  - `agent/tools/qweatherAuth.ts`：新增 `printDiagnosticsOnce` 一次性日志。
  - `agent/tools/qweatherGeo.ts`：新增 `explainQWeatherCode`、code 校验。
  - `agent/tools/getWeather.ts`：在两次 fetch 后立即校验 code。
- `apps/web`:
  - 无（错误消息从 chat.ts 的 catch 分支已经透传）。

## Decisions

### 1. 错误消息结构化但仍是字符串

- Decision:
  - 错误消息格式：`QWeather <endpoint> failed (HTTP <status>, code=<code>: <中文解释>)`。
- Rationale:
  - 前端只需一个字符串就能展示给用户；一行就能看出"是 401 鉴权问题"还是"是 204 地名查无"。
- Rejected alternatives:
  - 引入结构化错误对象（`{ kind, code, message }`）：要改 SSE 协议、shared 类型、前端错误气泡，收益不匹配。

### 2. 诊断日志只打一次

- Decision:
  - 模块级 `diagnosticsPrinted` 布尔标志；首次签发 JWT 后翻为 true，后续不再打。
- Rationale:
  - 长会话场景 JWT 每 15 分钟重签一次，不应每次都刷屏；启动后只需要确认一次"配置看起来对"。
- Rejected alternatives:
  - 用 LOG_LEVEL=debug 才打：用户大多数情况下不会调 log level；启动诊断必须默认可见。

### Data Flow / Responsibility

- 请求入口：
  - `getWeatherTool` / `getAttractionsTool`（`getAttractions` 也调用 `lookupQWeatherCity` 拿城市中心）→ `qweatherFetch` → QWeather API。
- 数据返回：
  - 成功时返回原始 JSON；失败时抛 `Error` → LangGraph 工具节点抛错 → chat.ts catch 分支 emit `error` 事件 → 前端 `useTravelAgent` 的 error 分支把 message 写入 assistant 消息 → ChatPage 渲染红底气泡。
- 职责边界：
  - `qweatherAuth` 负责签 JWT、打诊断日志；
  - `qweatherGeo` / `getWeather` 负责业务 code 校验和错误消息构造；
  - chat 路由不感知具体错误类型，按通用 error 路径透传。

### Compatibility / Migration

- 是否有字段兼容问题：无；错误消息字符串前端原本就直接渲染。
- 是否需要迁移旧数据：无。
- 是否需要重启 dev server：是（修改了 server 侧代码与 secrets/ 下密钥）。

## Validation Plan

- 类型检查：`pnpm --filter @travel/server typecheck` 通过。
- 构建验证：本 change 不改构建链路。
- 手工验证：
  - 启动 server，确认控制台首条 `[qweather-auth] JWT issued | host=... kid=... sub=...` 输出，肉眼对比 .env 与 QWeather 控制台。
  - 临时换错 `QWEATHER_KEY_ID` 模拟鉴权失败 → 前端错误气泡显示 `QWeather geo lookup failed for "成都" (HTTP 200, code=401: 鉴权失败 — JWT 签名、kid (凭据 ID)、sub (项目 ID) 或 API 域名可能不匹配)`。
  - 跑 `pnpm --filter @travel/server ping:weather`，确认能拉出 `code: 200, temp: ..., text: ...` 完整链路。

## Risks / Trade-offs

- 风险 1：诊断日志意外打到生产 log aggregation。
  - 缓解：仅打公开标识（host/kid/sub）和 24 字符 JWT 前缀，不含私钥；可接受。
- 风险 2：未来 QWeather 加新 code（譬如 451 法律拦截）时 `explainQWeatherCode` 落到 default。
  - 缓解：default 文案已写"未知错误，请对照官方错误码表"，不掩盖真相。

## Documentation Sync

- 需要同步的 `plans/` 文档：无。
- 需要同步的 `questions/` 文档：无（当前问题以日志 + 代码注释为主，未沉淀到 questions/）。
