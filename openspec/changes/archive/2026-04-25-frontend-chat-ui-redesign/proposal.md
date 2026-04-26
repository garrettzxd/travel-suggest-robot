## Why

- 当前问题或机会：
  - 聊天页面只有一个标题 + Markdown 气泡（[apps/web/src/chat/ChatPage.tsx](apps/web/src/chat/ChatPage.tsx) 旧版），信息密度低、视觉单调。
  - 后端 `/api/chat` 已经下发 `weather` / `attractions` / `card` 等结构化事件，但前端没有任何卡片化呈现。
- 为什么现在要做：
  - 新 PRD `plans/Web 端聊天界面视觉改版 PRD.md` 定稿，要求把 SSE 结构化事件转成"地点 / 天气 / 景点 / 出行建议"四张卡的复合会话 UI，并补吸顶 TopBar、吸底 InputBar、米白主题。
- 如果不做会怎样：
  - 后端 PRD §6 已落地的 TripCard / card 事件白白浪费；UI 层无法体现产品想要的"漫游"感；后续追加交互（chips、verdict 区分、骨架）都没有承载组件。

## What Changes

- `apps/web/src/main.tsx`：扩 ConfigProvider 主题映射，加载 `qweather-icons.css` 字体。
- 新建 `apps/web/src/theme/tokens.ts`：统一颜色、圆角、阴影、间距、tag 调色板，所有卡片读这一份。
- 新建 `apps/web/src/chat/cards/` 下 7 个组件：CardContainer、WelcomeCard、DestinationHero、WeatherCard、AttractionList、RecommendationPanel、TripCardView。
- 新建 `apps/web/src/chat/TopBar.tsx`、`apps/web/src/chat/InputBar.tsx`：吸顶 / 吸底骨架。
- 重写 `apps/web/src/chat/ChatPage.tsx`：三段 sticky 布局、按 `weather/attractions/card/hasToolStart` 路由 TripCardView 或 MarkdownTyping fallback。
- 扩展 `apps/web/src/chat/useTravelAgent.ts`：在 assistant 消息上挂 `weather` / `attractions` / `card` / `hasToolStart` 字段，消费 `card` 事件并就地 patch。
- 不再保留旧版 `ThoughtChain` 工具进度条——卡片骨架天然呈现工具进度。

## Capabilities

### New Capabilities

- `chat-ui`: 新增「漫游」主题下的卡片化聊天界面，包含 TopBar、欢迎卡、四张行程子卡、吸底输入栏。

### Modified Capabilities

- 无（旧版聊天页未沉淀为 capability）。

### Removed Capabilities

- 无。

## Impact

- Affected workspaces:
  - `apps/web`: 整个 `src/chat/` 目录重组，新增 `src/theme/`，`main.tsx` 与 `index.css` 调整。
  - `apps/server`: 不变。
  - `packages/shared`: 仅扩展类型 re-export（`apps/web/src/types.ts` 加 `TripCard`），shared 自身不动。
- Affected APIs / protocols:
  - 不变；前端只是开始消费已经存在的 `card` SSE 事件。
- Compatibility impact:
  - 视觉层面破坏性更新；旧用户首屏会看到全新的 WelcomeCard 与卡片布局。
- Risks:
  - 字体加载失败 → WeatherCard 图标显示空白（fallback 到 `qi-999`）。
  - AntD Bubble / Sender 升级或 props 变更可能影响 InputBar / 错误气泡渲染。
- Rollback:
  - 回退此 change 即可恢复旧版 ChatPage；`main.tsx` 主题与 qweather-icons 加载也会一起回退。
- Docs to update:
  - `plans/Web 端聊天界面视觉改版 PRD.md`：本次实现完整覆盖 §7 规定的范围，无需修改 PRD。
