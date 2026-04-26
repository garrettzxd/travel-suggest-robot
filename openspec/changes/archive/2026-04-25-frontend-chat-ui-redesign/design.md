## Context

- 现状：
  - `apps/web/src/chat/ChatPage.tsx` 旧版只有一个 `Bubble.List` 把所有消息按 Markdown 渲染。
  - `apps/web/src/chat/useTravelAgent.ts` 已经按事件类型 reduce 出 `messages / toolTrace / isRequesting`，但只暴露 `content` 字符串，没有结构化数据通路。
- 本次变更入口：
  - `plans/Web 端聊天界面视觉改版 PRD.md` §7 全部条目。
- 现有限制：
  - 仅按 ≥960px 桌面宽度设计；移动端只做最基础的折叠。
  - i18n 不在范围，文案全部中文硬编码。

## Goals / Non-Goals

**Goals:**

- 把 `tool_start` / `tool_end:getWeather` / `tool_end:getAttractions` / `card` 四类事件转成 4 张卡的渐进式渲染。
- 提供 CardContainer 作为唯一外壳，所有卡片不重复定义边框/阴影。
- 引入 `theme/tokens.ts` 作为颜色/间距/圆角的单一来源。
- 空会话渲染欢迎卡；闲聊（无工具）回退到 Markdown 打字机。

**Non-Goals:**

- 不修改 backend SSE 事件协议（已经在 §6 落地）。
- 不引入路由 / 多会话历史。
- 不做完整移动端响应式走查。
- 不重写 LangGraph agent / tools。

## Affected Layers

- `packages/shared`:
  - 无修改；`apps/web/src/types.ts` 仅 re-export `TripCard`。
- `apps/server`:
  - 无修改。
- `apps/web`:
  - 新增 `src/theme/tokens.ts`、`src/chat/TopBar.tsx`、`src/chat/InputBar.tsx`、`src/chat/cards/*.tsx`（7 个）。
  - 重写 `src/chat/ChatPage.tsx`、`src/main.tsx`、`src/index.css`、`src/chat/useTravelAgent.ts`。

## Decisions

### 1. CardContainer 作为唯一外壳

- Decision:
  - 所有卡片（含 WelcomeCard 内的能力面板）都基于同一个 `CardContainer` 组件渲染边框 / 圆角 / 阴影 / 内边距。
- Rationale:
  - 业务卡片不需要重复维护"白底+米色边+柔和阴影"这套外观；后续要换皮只动 CardContainer。
- Rejected alternatives:
  - 每个卡片各写一份样式：维护成本高、视觉容易失之毫厘。

### 2. Data Flow / Responsibility

- 请求入口：
  - `ChatPage` → `useTravelAgent.onRequest()` → `postChat` → 后端 `chatRoute` → `agent.streamEvents`。
- 数据返回：
  - SSE 事件回流：`useTravelAgent` 的 reducer 把 `tool_end`/`card` 直接 patch 到当前 assistant 消息上的 `weather` / `attractions` / `card` 字段。
  - `ChatPage.MessageRow` 根据 `hasToolStart` 与是否有结构化数据决定渲染 `TripCardView` 或 `Bubble`。
- 职责边界：
  - `shared` 不变；
  - `server` 不变；
  - `web` 负责把已结构化的数据组合成可视化卡片，骨架 / 错误态 / 空态全部在前端处理。

### 3. Compatibility / Migration

- 是否有字段兼容问题：无；TripCard 类型在 `packages/shared` 已存在。
- 是否需要迁移旧数据：无。
- 是否需要重启 dev server：是（首次添加 qweather-icons 字体导入需要 Vite 重启）。

## Validation Plan

- 类型检查：
  - `pnpm -r typecheck`（已通过）
- 构建验证：
  - `pnpm --filter @travel/web build`（本地验证；沙箱受 rollup native binding 限制未执行）
- 手工验证：
  - 空会话首屏：WelcomeCard 三列能力面板（粉/浅蓝/沙色）展示正确。
  - 输入"我想去成都"：先看到全骨架 → 工具陆续返回 → card 到达后填齐文案；TopBar 标题随首条 user 消息切换。
  - 输入"你好"：不调工具，回退 MarkdownTyping。
  - 错误路径：制造一次后端 5xx，看到红底错误气泡。

## Risks / Trade-offs

- 风险 1：
  - qweather-icons CSS 没加载 / 字体打包失败 → 天气图标全空。
  - 缓解：图标 fallback 到 `qi-999`；`apps/web/assets/weather-icons/` 已就位由 Vite 自动解析。
- 风险 2：
  - 业务卡片直接读 `colors.*` 会不会与 AntD 主题冲突。
  - 缓解：在 `main.tsx` 把 AntD `colorPrimary` 等关键 token 映射到我们的 colors，AntD 组件视觉与卡片调和一致。

## Documentation Sync

- 需要同步的 `plans/` 文档：
  - `plans/Web 端聊天界面视觉改版 PRD.md`：本次完全按 §7 实现，无需修改。
- 需要同步的 `questions/` 文档：
  - 无。
