## Why

- 当前问题或机会：
  - 上线后偶发"天气数据获取失败"，但前端只看到"Cannot read properties of undefined (reading 'map')" 之类的代码异常，看不出是 JWT 鉴权问题。
  - `apps/server/src/agent/tools/qweatherGeo.ts` 与 `apps/server/src/agent/tools/getWeather.ts` 都没有先校验 QWeather 响应里的业务 `code` 字段就直接读 `json.location` / `json.daily`。
- 为什么现在要做：
  - 用户怀疑是 JWT 配置错。需要把真实的 QWeather code（譬如 401 鉴权失败、403 无权限、204 地名查无）暴露到错误消息里，便于一眼定位。
- 如果不做会怎样：
  - 每次失败都要从 server 日志反推、人工对照官方错误码表；前端用户只能看到一堆"undefined"乱码错误。

## What Changes

- `apps/server/src/agent/tools/qweatherGeo.ts`：
  - 新增 `explainQWeatherCode(code)` 中文解释表（200/204/400/401/402/403/404/429/500）。
  - 在 `lookupQWeatherCity` 里**先**判断 `json.code !== "200"` 再读 `json.location`；错误消息附 HTTP status + code + 中文解释。
  - 同名导出 `explainQWeatherCode` 给 `getWeather` 复用。
- `apps/server/src/agent/tools/getWeather.ts`：
  - 在 `Promise.all([nowRes, dailyRes])` 解析后，先校验 `nowJson.code` / `dailyJson.code`，非 200 抛错。
- `apps/server/src/agent/tools/qweatherAuth.ts`：
  - 在首次签发 JWT 时一次性打 `[qweather-auth] JWT issued | host=xxx kid=xxx sub=xxx jwt=eyJ...` 诊断日志（仅前 24 字符 JWT，不泄露密钥）。
- 同步生成新的 Ed25519 PKCS8 密钥对到 `secrets/`：
  - `qweather-ed25519-private.pem`、`qweather-ed25519-public.pem`；旧密钥备份成 `*.bak-20260425-093717`。

## Capabilities

### New Capabilities

- `qweather-integration`: 沉淀 QWeather JWT 鉴权链路、错误码透传与诊断日志的能力边界。

### Modified Capabilities

- 无（首次为 QWeather 沉淀 capability）。

### Removed Capabilities

- 无。

## Impact

- Affected workspaces:
  - `apps/server`: `agent/tools/qweatherAuth.ts`、`agent/tools/qweatherGeo.ts`、`agent/tools/getWeather.ts`。
  - `apps/web`: 不变（错误消息原样从 SSE error 事件透传到错误气泡）。
  - `packages/shared`: 不变。
- Affected APIs / protocols:
  - `/api/chat` 的 `error` 事件 message 字段会包含更具体的中文错误描述。
- Compatibility impact:
  - 完全向后兼容；只是错误消息更详细。
- Risks:
  - 诊断日志意外泄露 kid / sub：日志中只打前 24 字符 JWT 与公开的 host/kid/sub，不打私钥本身。
- Rollback:
  - 单独回退此 change 即可恢复旧的"静默吞 code"行为。新生成的密钥仍然有效，只是错误消息变粗。
- Docs to update:
  - 无（错误码表已在代码注释中维护）。
