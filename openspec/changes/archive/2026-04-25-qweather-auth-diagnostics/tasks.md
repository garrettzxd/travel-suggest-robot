## 1. Shared / Protocol

- [x] 1.1 不涉及 shared 协议变更；错误消息仍是 `error` 事件的 message 字符串。

## 2. Server

- [x] 2.1 `apps/server/src/agent/tools/qweatherGeo.ts`：新增 `explainQWeatherCode(code)` 中文解释表，覆盖 200/204/400/401/402/403/404/429/500。
- [x] 2.2 `apps/server/src/agent/tools/qweatherGeo.ts`：在 `lookupQWeatherCity` 里把 `code !== "200"` 校验前置到 `json.location` 检查之前，错误消息含 HTTP status + code + 中文解释。
- [x] 2.3 `apps/server/src/agent/tools/qweatherGeo.ts`：导出 `explainQWeatherCode` 给 `getWeather` 复用。
- [x] 2.4 `apps/server/src/agent/tools/getWeather.ts`：在 `nowJson` / `dailyJson` 解析后立即校验 `code`，复用 `explainQWeatherCode`。
- [x] 2.5 `apps/server/src/agent/tools/qweatherAuth.ts`：新增 `printDiagnosticsOnce`，在首次签发 JWT 后打一行 `[qweather-auth] JWT issued | host=... kid=... sub=... jwt=...`。

## 3. Web

- [x] 3.1 不涉及 web 改动；错误消息原样从 SSE error 事件透传到错误气泡。

## 4. Validation

- [x] 4.1 `pnpm --filter @travel/server typecheck` 通过。
- [x] 4.2 启动 server 确认 `[qweather-auth] JWT issued ...` 日志按预期输出。
- [x] 4.3 手工测试：临时换错 `QWEATHER_KEY_ID` 模拟 401，前端错误气泡显示完整中文错误。

## 5. Documentation

- [x] 5.1 不涉及 `plans/`。
- [x] 5.2 不涉及 `questions/`（错误码表已沉淀到代码注释）。
- [x] 5.3 此 change 的 proposal/design/tasks/spec 一致。

## 6. Operational

- [x] 6.1 重新生成 Ed25519 PKCS8 密钥对到 `secrets/`，旧密钥备份成 `*.bak-20260425-093717`。
- [x] 6.2 用户已在 QWeather 控制台用新公钥替换旧公钥（操作步骤：控制台 → 项目管理 → 凭据管理 → 替换公钥）。
