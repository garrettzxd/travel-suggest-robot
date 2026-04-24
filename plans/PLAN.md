# Travel Suggest Robot — 实施计划

## Context

在空目录 `/Users/garrettzxd/codes/travel-suggest-robot` 上从零搭建一个"旅游规划"聊天机器人。产品目标是用户输入目的地后，机器人能够：

1. 推荐当地景点
2. 查询当地近期天气（当前 + 7 日）
3. 结合天气和季节，给出"此刻是否适合前往"的建议
4. 拒绝非旅游规划类话题

已确认的技术选型（不可变）：

- Monorepo 同时承载前后端
- 后端 Node.js + TypeScript，LLM 编排使用 langchain.js
- 前端 React 生态 + Ant Design X (`@ant-design/x`)
- 前后端均 ES Modules
- **LLM 提供方：Kimi (Moonshot)**，OpenAI 兼容接口
- **天气数据：和风天气 QWeather**（开发版 API Key 模式）
- **景点数据：高德地图 Web 服务 API**（POI 搜索）
- **UI 语言：中文 UI + Docker 部署**

## 产品计划

### MVP 范围（本次实现）

| 能力 | 说明 |
|---|---|
| 单轮/多轮对话 | 用户输入"想去 {地名}"，机器人先并行调用天气+景点工具，再综合给出建议 |
| 景点推荐 | 返回 6–8 个主要景点（名称、一句话介绍、分类） |
| 天气查询 | 当前天气 + 未来 7 日概览（温度区间、天气状况、降水） |
| 出行建议 | 结合季节、天气、降水给出"是否适合现在去"的结论和理由 |
| 话题限制 | 系统 prompt 约束 + 标准化拒绝回复 |
| 流式体验 | Bubble 逐字出现，中间展示 ThoughtChain（调用天气/景点中…） |
| 中文 UI | Ant Design `ConfigProvider` 使用 `zh_CN` locale |
| Docker 化 | 单镜像或 compose，两套服务（前端静态 + 后端 API） |

### 不在本次范围（后续可扩展）

- 多会话持久化（`Conversations` 组件、数据库）
- 用户账号
- 行程规划（多日安排、酒店、交通）
- 观测性（LangSmith tracing）
- i18n 切换（纯中文即可）

## 技术方案

### 1. 仓库结构

使用 **pnpm workspaces**，无 turborepo（3 个 workspace 条目不需要）。

```
travel-suggest-robot/
├── package.json                 # 私有 root, "packageManager": "pnpm@10.x"
├── pnpm-workspace.yaml          # packages: ["apps/*", "packages/*"]
├── tsconfig.base.json           # ESM + NodeNext + strict
├── .nvmrc                       # 24 (Node 24 LTS)
├── .env.example
├── .gitignore
├── README.md
├── docker-compose.yml           # dev 和 prod 同时可用
├── Dockerfile.server
├── Dockerfile.web               # 多阶段：构建 → nginx 静态托管
│
├── packages/
│   └── shared/                  # @travel/shared
│       ├── package.json         # "type": "module", exports field
│       ├── tsconfig.json        # composite: true
│       └── src/
│           ├── index.ts
│           ├── chat.ts          # ChatRequest / ChatMessage / StreamEvent
│           └── travel.ts        # Attraction / WeatherSnapshot / TravelVerdict
│
└── apps/
    ├── server/                  # @travel/server
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── src/
    │       ├── index.ts         # Koa 启动
    │       ├── env.ts           # zod 校验 env
    │       ├── app.ts           # Koa 实例 + 中间件 + router 装配
    │       ├── routes/chat.ts   # POST /api/chat (SSE)
    │       ├── agent/
    │       │   ├── graph.ts     # LangGraph createReactAgent
    │       │   ├── prompts.ts   # 系统 prompt + 拒绝模板
    │       │   └── tools/
    │       │       ├── getWeather.ts      # QWeather
    │       │       └── getAttractions.ts  # 高德 POI
    │       ├── llm/provider.ts  # ChatOpenAI 指向 Moonshot baseURL
    │       └── utils/sse.ts
    │
    └── web/                     # @travel/web
        ├── package.json
        ├── vite.config.ts
        ├── tsconfig.json
        ├── index.html
        └── src/
            ├── main.tsx         # ConfigProvider zh_CN
            ├── App.tsx
            ├── chat/
            │   ├── ChatPage.tsx           # Bubble.List + Sender
            │   └── useTravelAgent.ts      # 包装 useXAgent + useXChat
            ├── api/client.ts    # SSE 解析
            └── types.ts         # re-export @travel/shared
```

### 2. 后端关键设计

- **HTTP 框架**：**Koa 2.x** + `@koa/router` + `@koa/cors` + `@koa/bodyparser`（原生 ESM 支持，洋葱模型中间件便于给 SSE 路由做流式特判）。请求体用 zod 手动校验（Koa 没有内置 schema），日志用 `koa-pino-logger` 接入 pino。
- **LLM 编排**：使用 **LangChain v1** 的 `createAgent`（由 `langchain` 主包导出，取代已迁移的 `@langchain/langgraph/prebuilt` 的 `createReactAgent`；参数 `prompt` 也已更名为 `systemPrompt`）。`createAgent` 内部仍基于 LangGraph，支持工具并行、流式事件、middleware 扩展。
  ```ts
  import { createAgent } from "langchain";
  const agent = createAgent({
    llm,
    tools: [getWeatherTool, getAttractionsTool],
    systemPrompt: TRAVEL_SYSTEM_PROMPT,
  });
  ```
- **LLM Provider (Kimi)**：使用 `@langchain/openai` 的 `ChatOpenAI`，配置：
  ```
  model        = "kimi-k2.6"
  apiKey       = process.env.MOONSHOT_API_KEY
  configuration.baseURL = "https://api.moonshot.cn/v1"
  streaming    = true
  ```
  Kimi 完全兼容 OpenAI 的 tool-calling 协议，无需特殊适配。
- **工具 1 — `getWeather(location)`**
  - 使用 QWeather **专属 API Host + JWT (EdDSA) 认证**：`.env` 里 `QWEATHER_API_HOST=nq3dmvcxr5.re.qweatherapi.com`，scheme 统一 `https://`；认证通过 `Authorization: Bearer <jwt>` 头部，不再附带 `key=` 查询参数。
  - JWT 签名（由 `apps/server/src/agent/tools/qweatherAuth.ts` 封装，使用 [`jose`](https://www.npmjs.com/package/jose)）：
    - header: `{ alg: "EdDSA", kid: QWEATHER_KEY_ID }`
    - payload: `{ sub: QWEATHER_PROJECT_ID, iat: now-30, exp: now+900 }`（15 分钟有效）
    - 私钥：`importPKCS8(readFile(QWEATHER_PRIVATE_KEY_PATH), "EdDSA")`
    - 模块级缓存 token，距离过期 < 60s 时重新签发；私钥只导入一次
  - 请求路径：
    - GeoAPI：`GET https://${QWEATHER_API_HOST}/geo/v2/city/lookup?location={name}`，取第一条的 `id`。
    - 并发：`GET /v7/weather/now?location={id}` 和 `/v7/weather/7d?location={id}`。
  - 响应体是 gzip 编码，`fetch` 自动处理。
  - 归一化为 shared 里的 `WeatherSnapshot`。
  - **凭据准备**（开发者一次性）：
    1. 在 QWeather 控制台 → 项目管理创建项目，得到 **Project ID**。
    2. 本地生成 Ed25519 密钥对：
       ```bash
       mkdir -p secrets
       openssl genpkey -algorithm ED25519 -out secrets/qweather-ed25519-private.pem
       openssl pkey -in secrets/qweather-ed25519-private.pem -pubout -out secrets/qweather-ed25519-public.pem
       ```
    3. 把公钥 `qweather-ed25519-public.pem` 上传到控制台凭据管理，得到 **Key ID (kid)**。
    4. `.env` 填 `QWEATHER_PROJECT_ID` / `QWEATHER_KEY_ID` / `QWEATHER_PRIVATE_KEY_PATH`。`secrets/` 和 `*.pem` 已进 `.gitignore`。
- **工具 2 — `getAttractions(location)`**
  - `GET https://restapi.amap.com/v3/place/text?keywords=景点&city={city}&types=110000&offset=8&key={AMAP_KEY}`（110000 = 风景名胜大类）。
  - 映射为 `Attraction[]`（名称、地址、类型，可带评分 biz_ext）。
  - 若城市名解析失败，回退为 `keywords={location}景点` 全国搜索。
- **话题限制**：仅靠系统 prompt（Kimi 指令遵循能力足够）。Prompt 结构：
  1. 角色：只负责旅游规划（景点 / 天气 / 时节建议）。
  2. 非旅游请求使用固定拒绝模板："抱歉，我只能帮你规划旅行…"
  3. 工作流：当用户提到具体地名，**必须并行调用** `getWeather` 和 `getAttractions`，再综合作答。
  4. 输出格式要求（三段式：景点 / 天气摘要 / 此刻是否推荐去）。
- **流式（SSE 标准化）**：POST + `text/event-stream`。前后端严格对齐 **Ant Design X `XStream` 默认协议**，避免自定义解析器：
  - 分隔符常量（与 `@ant-design/x` 的 `DEFAULT_*` 一致，**不使用截图里的 `=`**；截图中 `KV_SEPARATOR='='` 是对 Ant Design X 协议的误读，会导致 XStream 内置解析器报 `"The key-value separator ':' is not found in the sse line chunk"`）：
    ```ts
    // packages/shared/src/sse.ts — 前后端共享
    export const STREAM_SEPARATOR = '\n\n';  // 帧之间
    export const PART_SEPARATOR   = '\n';    // 一帧内 field 行之间
    export const KV_SEPARATOR     = ':';     // field: value
    ```
  - 每帧严格按 SSE 规范输出两行 + 空行：
    ```
    event: token
    data: {"delta":"成"}

    ```
    （`data` 字段用 JSON 字符串，便于强类型反序列化。）
  - 编码：服务端用 `stream.write(Buffer.from(frame, 'utf8'))`；前端走 `response.body.pipeThrough(new TextDecoderStream())`，对旧浏览器 `@ant-design/x` 已内置 TextDecoderStream polyfill（2.0+），前端无需额外引入。
  - Koa 写法：`ctx.status = 200`；`ctx.set({'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache','Connection':'keep-alive','X-Accel-Buffering':'no'})`；把 `PassThrough` 流赋给 `ctx.body`；`ctx.req.on('close', ...)` 时 `AbortController.abort()` 取消 agent 迭代。
  - 事件 schema 落在 `@travel/shared`：
    ```
    token       { delta }
    tool_start  { name, args }
    tool_end    { name, result }
    final       { content }
    error       { message }
    done        {}
    ```
  - 事件来源：`createAgent` 的 `.streamEvents(input, { version: "v2" })` 过滤 `on_chat_model_stream` / `on_tool_start` / `on_tool_end` 后映射写入 SSE。
- **环境变量**（`.env.example`）：
  ```
  PORT=3001
  CORS_ORIGIN=http://localhost:5173
  MOONSHOT_API_KEY=
  MOONSHOT_MODEL=kimi-k2.6
  QWEATHER_API_HOST=nq3dmvcxr5.re.qweatherapi.com
  QWEATHER_PROJECT_ID=
  QWEATHER_KEY_ID=
  QWEATHER_PRIVATE_KEY_PATH=./secrets/qweather-ed25519-private.pem
  AMAP_KEY=
  LOG_LEVEL=info
  ```
  启动时用 zod 校验，缺失立即 fail fast。

### 3. 前端关键设计

- **构建**：Vite 6 + React 18 + TS。
- **Ant Design X 组件映射**（仅使用 2.x 的组件层，不使用已在 2.0 中移除的 `XStream` / `XRequest` / `useXAgent` / `useXChat`）：
  | 需求 | 组件 |
  |---|---|
  | 消息列表流式渲染 | `Bubble.List` + `Bubble`（`typing` 属性） |
  | 输入与发送 | `Sender` |
  | 展示工具调用过程 | `ThoughtChain`（显示 `getWeather` / `getAttractions` 的 running/done/error 状态） |
  | 多会话列表 | **不做**（MVP 外） |
- **自定义 Hook `useTravelAgent.ts`**（手写 SSE 解析，依赖零额外库）：
  1. 调用 `postChat(body, signal)` 发起 `fetch('/api/chat', ...)`，返回 `response.body` 这个 `ReadableStream<Uint8Array>`。
  2. `stream.pipeThrough(new TextDecoderStream())` 得到文本流；按 `STREAM_SEPARATOR='\n\n'` 切帧，每帧再按 `PART_SEPARATOR='\n'` + `KV_SEPARATOR=':'` 解析出 `{ event, data }`（`data` 是 JSON 字符串，反序列化后使用）。分隔符常量从 `@travel/shared` 导入，前后端同源。
  3. 事件分派：`token` → 累加到当前 assistant bubble 的 `content`；`tool_start` → 推入 `toolTrace`；`tool_end` → 把最近的 running 条目标记为 done；`final` → 用返回 content 覆写 bubble（兜底）；`error` → 错误态；`done` → 结束循环。
  4. `AbortController` 绑定 `fetch` 的 `signal`，切换会话或组件卸载时取消请求。
  5. 对外暴露 `{ messages, onRequest, toolTrace, isRequesting }` 给 `ChatPage`。
- **本地化**：`main.tsx` 用 `<ConfigProvider locale={zhCN}>` 包裹，系统 prompt 与拒绝模板均为中文。
- **状态管理**：`useState` + `useXChat` 即可，不引入 Zustand/Redux。

### 4. 共享类型包 `@travel/shared`

跨越 HTTP 边界的一切放这里，前后端共用：

```ts
// chat.ts
export interface ChatMessage { role: 'user'|'assistant'; content: string; id: string; createdAt: number }
export interface ChatRequest { message: string; history: ChatMessage[] }
export type ToolName = 'getWeather' | 'getAttractions'
export type StreamEvent =
  | { type: 'token'; delta: string }
  | { type: 'tool_start'; name: ToolName; args: unknown }
  | { type: 'tool_end';   name: ToolName; result: unknown }
  | { type: 'final'; content: string }
  | { type: 'error'; message: string }
  | { type: 'done' }

// travel.ts
export interface Attraction { name: string; address?: string; category: string; rating?: number }
export interface WeatherDaily { date: string; tMinC: number; tMaxC: number; condition: string; precipMm: number }
export interface WeatherSnapshot {
  location: string; lat: number; lon: number
  current: { tempC: number; condition: string; windKph: number }
  daily: WeatherDaily[]
}
export interface TravelVerdict { goodTimeToVisit: boolean; reason: string }
```

`tsconfig.json` 设 `composite: true`，两端通过 pnpm workspace 软链接导入。

### 5. Docker 化

- `Dockerfile.server`：`node:24-alpine` → `pnpm install --filter @travel/server...` → `pnpm --filter @travel/server build` → 运行 `dist/index.js`，暴露 3001。
- `Dockerfile.web`：多阶段，`node:24-alpine` 里 `pnpm --filter @travel/web build`，产物 `dist/` 拷贝到 `nginx:alpine`，nginx.conf 配置 `/api → http://server:3001`，SSE 需 `proxy_buffering off; proxy_read_timeout 1h;`。
- `docker-compose.yml`：两个 service，共用 `.env`。

## 需要修改/新建的关键文件

- [package.json](../package.json)（root，含 scripts 和 workspace 声明）
- [pnpm-workspace.yaml](../pnpm-workspace.yaml)
- [tsconfig.base.json](../tsconfig.base.json)
- [packages/shared/src/chat.ts](../packages/shared/src/chat.ts)
- [packages/shared/src/travel.ts](../packages/shared/src/travel.ts)
- [packages/shared/src/sse.ts](../packages/shared/src/sse.ts)（STREAM/PART/KV 三个分隔符常量，前后端共享）
- [apps/server/src/index.ts](../apps/server/src/index.ts)
- [apps/server/src/app.ts](../apps/server/src/app.ts)
- [apps/server/src/env.ts](../apps/server/src/env.ts)
- [apps/server/src/routes/chat.ts](../apps/server/src/routes/chat.ts)
- [apps/server/src/utils/sse.ts](../apps/server/src/utils/sse.ts)
- [apps/server/src/agent/graph.ts](../apps/server/src/agent/graph.ts)
- [apps/server/src/agent/prompts.ts](../apps/server/src/agent/prompts.ts)
- [apps/server/src/agent/tools/getWeather.ts](../apps/server/src/agent/tools/getWeather.ts)
- [apps/server/src/agent/tools/getAttractions.ts](../apps/server/src/agent/tools/getAttractions.ts)
- [apps/server/src/llm/provider.ts](../apps/server/src/llm/provider.ts)
- [apps/web/vite.config.ts](../apps/web/vite.config.ts)
- [apps/web/src/main.tsx](../apps/web/src/main.tsx)
- [apps/web/src/chat/ChatPage.tsx](../apps/web/src/chat/ChatPage.tsx)
- [apps/web/src/chat/useTravelAgent.ts](../apps/web/src/chat/useTravelAgent.ts)
- [apps/web/src/api/client.ts](../apps/web/src/api/client.ts)
- [Dockerfile.server](../Dockerfile.server)
- [Dockerfile.web](../Dockerfile.web)
- [docker-compose.yml](../docker-compose.yml)
- [.env.example](../.env)

## 关键依赖（版本按 2026-04 最新稳定版；`pnpm install` 时由 pnpm 解析到当时 latest）

Server:
- Koa 生态：`koa@^2`, `@koa/router@^13`, `@koa/cors@^5`, `@koa/bodyparser@^5`, `koa-pino-logger@^4`, `pino@^9`, `zod@^3`
- LangChain v1：`langchain@^1`（导出 `createAgent`）, `@langchain/core@^1`, `@langchain/openai@^1`
  - 仅在需要手写 StateGraph 时才额外加 `@langchain/langgraph@^1`；本 MVP 不需要
- `dotenv@^16`
- devDeps 类型：`@types/koa`, `@types/koa__router`, `@types/koa__cors`, `@types/node@^24`

Web:
- `react@^19`, `react-dom@^19`（React 19 已稳定，`@ant-design/x@^2` 兼容）
- `antd@^5`, `@ant-design/x@^2`（2.x 内置 TextDecoderStream polyfill 与可配置 SSE 分隔符）
- `vite@^6`, `@vitejs/plugin-react@^4`

Root dev:
- `typescript@^5.6`, `tsx@^4`（server dev 热重启）
- Node 运行时：`24.x`（对齐 `.nvmrc`）

## 验证方式（端到端）

1. **环境变量**：`.env` 填入 `MOONSHOT_API_KEY` / `QWEATHER_KEY` / `AMAP_KEY`。
2. **本地启动**：`pnpm install` → `pnpm --filter @travel/shared build` → 两个终端分别 `pnpm --filter @travel/server dev` 和 `pnpm --filter @travel/web dev`。
3. **功能验证**：
   - 打开 `http://localhost:5173`，输入"我想去成都"，预期：先看到 ThoughtChain 两行"查询天气中…""搜索景点中…"，随后流式出现"景点 / 天气 / 是否推荐去"三段。
   - 输入"帮我写段 Python 代码"，预期：命中话题拒绝模板。
   - 输入"下周去拉萨合适吗"，预期：带上季节和 7 日天气给出建议。
4. **工具单测（可选但建议）**：`apps/server/src/agent/tools/*.test.ts` 用 `vitest` 对 QWeather/高德的 happy path 和城市解析失败路径做断言（使用 `msw` 拦截 HTTP）。
5. **Docker 验证**：`docker compose up --build` → 浏览器访问 `http://localhost:8080`（nginx），重复上述 3 个对话。确认 SSE 帧不被 nginx 缓冲（能看到逐字出现）。
6. **类型一致性**：`pnpm -r typecheck`（根 script），前后端共享类型无漂移。
