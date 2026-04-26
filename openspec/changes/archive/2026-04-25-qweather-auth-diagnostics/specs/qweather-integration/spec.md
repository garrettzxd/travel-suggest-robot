## ADDED Requirements

### Requirement: QWeather 业务 code 优先校验

任何调用 QWeather REST API 的代码路径必须先校验响应 JSON 里的 `code` 字段，仅当 `code === "200"` 时才读业务字段（`location` / `now` / `daily` 等）；否则抛出包含 HTTP status、QWeather code、中文解释三段的 Error。

#### Scenario: 鉴权失败

- **WHEN** QWeather 返回 HTTP 200 但 `json.code === "401"`
- **THEN** 抛出 `Error`，message 包含 `HTTP 200, code=401: 鉴权失败 — JWT 签名、kid (凭据 ID)、sub (项目 ID) 或 API 域名可能不匹配`

#### Scenario: 地名查无

- **WHEN** QWeather geo 返回 `code === "204"`
- **THEN** 抛出 `Error`，message 包含 `code=204: 请求成功但查询结果为空（地名拼写或地区是否支持？）`

### Requirement: 进程级一次性鉴权诊断日志

进程内首次签发 JWT 时必须打一行包含 host / kid / sub 与 JWT 前 24 字符的诊断日志，且整个进程生命周期内只打一次。

#### Scenario: server 启动后第一次工具调用

- **WHEN** 任何 QWeather 工具触发首次 `getQWeatherToken()`
- **THEN** stderr 输出形如 `[qweather-auth] JWT issued | host=xxx.re.qweatherapi.com kid=AB12CD kid sub=12345 jwt=eyJhbGciOiJF...`

#### Scenario: 后续 token 刷新

- **WHEN** JWT 过期触发重签
- **THEN** 不再输出诊断日志；缓存的 `diagnosticsPrinted` 标志阻止重复输出

### Requirement: QWeather 错误码中文解释表

`apps/server/src/agent/tools/qweatherGeo.ts` 必须导出 `explainQWeatherCode(code)` 函数，至少覆盖 200 / 204 / 400 / 401 / 402 / 403 / 404 / 429 / 500 九个常见 code，未命中走"未知错误"提示。

#### Scenario: 调用方复用解释表

- **WHEN** `getWeather` 拼装错误消息
- **THEN** 通过同一个 `explainQWeatherCode` 函数取中文文案，与 `lookupQWeatherCity` 保持口径一致
