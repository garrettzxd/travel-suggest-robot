# 项目规则

## 代码注释规范

- **每个函数必须有注释**：所有函数（包括普通函数、箭头函数、类方法、React 组件）在定义处都必须添加注释，说明其用途。
  - TypeScript/JavaScript：使用 JSDoc 风格（`/** ... */`），至少包含一句功能描述；涉及复杂参数或返回值时补充 `@param` / `@returns`。
  - 导出的公共函数/工具方法：注释需说明使用场景与边界条件。
  - 内部短小的工具函数：允许单行注释，但不可省略。

## 计划文档存放规范

- **Plan 模式产物必须落地到 `plans/` 目录**：在 plan 模式下生成的计划文档（PRD、实现方案、设计稿等）必须保存到项目根目录下的 `plans/` 目录中，不得散落在仓库其他位置。
  - 文件命名建议使用可读的中文或英文短语，能反映文档主题。
  - 每一次计划生成必须放在plans子文件夹下，文件夹名称使用日期命名YYYY-MM-DD，同一个日期的生成的计划放在同一个文件夹内 
  - 已存在 `plans/` 目录，直接写入即可，无需额外创建子目录（除非按主题归档需要）。

## 项目探索优先级规范

- **计划前优先以 `CLAUDE.md` 为准**：后续 agent 在进入计划 / 设计 / 代码探索前，必须先阅读并使用本文档中的「项目结构索引」和「关键数据流」。默认不要主动用 `find` / `grep` / Explore agent 扫描整个仓库来重建项目结构，以节省时间和 token。
- **只在索引不足时按需探索**：当任务需要的内部实现细节不在本文档覆盖范围内时，才读取相关的单个文件或使用 `rg` 做小范围搜索；新增、删除或移动关键文件后，必须同步更新本文档的项目结构索引。

## 项目结构索引

> **使用规则（重要）**：在做任何代码探索 / 计划设计前，**优先以本节为准**，不要再用 `find` / `grep` / Explore agent 主动扫整个仓库。只有当你需要的内容**确实不在本索引覆盖范围内**（例如某个文件的内部实现细节），才按需读单个文件；新增/删除关键文件时必须同步更新本索引。

### 顶层布局

pnpm monorepo，三个工作区：

```
travel-suggest-robot/
├── apps/server/           # Koa + LangGraph 后端，SSE 推送
├── apps/web/              # Vite + React 前端聊天 UI
├── packages/shared/       # 跨端共享 TS 类型与 SSE 常量
├── plans/                 # 计划文档（按 YYYY-MM-DD 归档）
├── questions/             # 排障 / 问题记录（中文）
├── .claude/               # Claude Code skills / 命令 / 本地权限
├── tsconfig.base.json     # 共享 TS 编译配置
├── pnpm-workspace.yaml    # 工作区清单
├── docker-compose.yml     # 容器编排（如适用）
└── .env.example           # 后端环境变量样例（QWeather / LLM key 等）
```

### apps/server（后端）

- [apps/server/src/index.ts](apps/server/src/index.ts) / [apps/server/src/app.ts](apps/server/src/app.ts) — Koa 启动入口与中间件装配。
- [apps/server/src/agent/](apps/server/src/agent/) — LangGraph agent、system prompt、TripCard / ItineraryCard 工具集。
- [apps/server/src/routes/](apps/server/src/routes/) — HTTP / SSE 路由入口；核心聊天接口在 [apps/server/src/routes/chat/](apps/server/src/routes/chat/) 模块（按能力拆分：route / handlers / sseLifecycle / streamParsers / toolMeta / tripCard / messages / logger / types / legacyUpdatesEmitter）。
- [apps/server/src/llm/](apps/server/src/llm/) — LLM 客户端与 provider 封装。
- [apps/server/src/utils/](apps/server/src/utils/) — 日志、SSE 帧写入等通用工具。
- [apps/server/src/scripts/](apps/server/src/scripts/) — LLM / QWeather 等第三方连通性自检脚本。
- [apps/server/src/env.ts](apps/server/src/env.ts) — 环境变量加载与校验。

### apps/web（前端）

- [apps/web/src/main.tsx](apps/web/src/main.tsx) / [apps/web/src/App.tsx](apps/web/src/App.tsx) — React 根挂载与应用根组件。
- [apps/web/src/chat/](apps/web/src/chat/) — 聊天页、输入栏、顶栏、SSE 消费 hook 与消息状态管理。
- [apps/web/src/chat/cards/](apps/web/src/chat/cards/) — TripCard / ItineraryCard 结构化展示组件。
- [apps/web/src/api/](apps/web/src/api/) — 后端 `/chat` SSE 客户端封装。
- [apps/web/src/theme/](apps/web/src/theme/) — 前端设计 token。
- [apps/web/src/index.css](apps/web/src/index.css) — 全局样式与 CSS 变量。
- [apps/web/assets/weather-icons/](apps/web/assets/weather-icons/) — QWeather 官方图标资源。
- [apps/web/index.html](apps/web/index.html) / [apps/web/vite.config.ts](apps/web/vite.config.ts) — Vite 入口与构建配置。

### packages/shared（共享类型 / 常量）

- [packages/shared/src/index.ts](packages/shared/src/index.ts) — 出口 barrel：`export * from './chat.js' / './travel.js' / './sse.js'`。
- [packages/shared/src/chat.ts](packages/shared/src/chat.ts) — 聊天请求 / 历史消息相关类型。
- [packages/shared/src/travel.ts](packages/shared/src/travel.ts) — `WeatherSnapshot` / `Attraction` / `TripCard` / `Itinerary` 等核心领域类型（**所有跨端 schema 都加在这里**）。
- [packages/shared/src/sse.ts](packages/shared/src/sse.ts) — SSE 帧分隔符常量。

### 周边目录

- [plans/YYYY-MM-DD/](plans/) — 按日期归档的计划文档（PRD / 设计稿 / 技术方案）。
- [questions/](questions/) — 已落地的排障记录（问题表现 / 原因 / 解决方法）。
- [.claude/skills/](.claude/skills/) / [.claude/commands/](.claude/commands/) — 项目自定义 skills 与命令。
- [.claude/settings.local.json](.claude/settings.local.json) — 本地权限白名单（不要写到全局 settings）。
- [README.md](README.md) — 项目简介与启动指引。

### 关键数据流（一图记忆）

```
用户输入
  → apps/web/src/chat/useTravelAgent.ts (POST /chat, 消费 SSE)
  → apps/server/src/routes/chat/route.ts (订阅 LangGraph 事件，分派给 handlers.ts)
  → apps/server/src/agent/graph.ts (LLM + tools)
       ├─ getWeather      → WeatherSnapshot
       ├─ getAttractions  → Attraction[]
       ├─ finalizeTripCard → narrative → emit 'card' SSE
       └─ recommendItinerary → Itinerary → emit 'itinerary' SSE
  → useTravelAgent.ts patch message.card / message.itinerary
  → ChatPage.tsx 切到 TripCardView / ItineraryCard 渲染
```

新增结构化卡片功能时，按这条链路从 shared 类型 → tool → graph → chat.ts 事件 → 前端 hook → 子卡组件依次扩展即可。
