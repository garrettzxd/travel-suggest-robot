## 1. Shared / Protocol

- [x] 1.1 复核 `packages/shared/src/{travel,chat}.ts` 已包含 `TripCard` / `card` 事件，无需新增。
- [x] 1.2 在 `apps/web/src/types.ts` 把 `TripCard` 加入 re-export 列表。

## 2. Server

- [x] 2.1 不涉及 server 改动；本 change 仅消费已有 `card` SSE 事件。

## 3. Web

- [x] 3.1 新建 `apps/web/src/theme/tokens.ts`（colors / tagPalette / radius / shadow / spacing / layout）。
- [x] 3.2 新建 `apps/web/src/chat/cards/CardContainer.tsx`：唯一卡片外壳。
- [x] 3.3 新建 `apps/web/src/chat/cards/WelcomeCard.tsx`：首屏空会话欢迎卡。
- [x] 3.4 新建 `apps/web/src/chat/cards/DestinationHero.tsx`：地点 Hero（含骨架 + verdict badge）。
- [x] 3.5 新建 `apps/web/src/chat/cards/WeatherCard.tsx`：当前天气 + 7 日预报 + summary。
- [x] 3.6 新建 `apps/web/src/chat/cards/AttractionList.tsx`：景点行列表（缩略图 + tag + 评分 + 距离）。
- [x] 3.7 新建 `apps/web/src/chat/cards/RecommendationPanel.tsx`：pill + headline + body + chips。
- [x] 3.8 新建 `apps/web/src/chat/cards/TripCardView.tsx`：四张子卡组合器。
- [x] 3.9 新建 `apps/web/src/chat/TopBar.tsx`、`apps/web/src/chat/InputBar.tsx`：吸顶 / 吸底骨架。
- [x] 3.10 扩展 `apps/web/src/chat/useTravelAgent.ts`：在 assistant 消息上挂 `weather` / `attractions` / `card` / `hasToolStart`，消费 `card` 事件。
- [x] 3.11 重写 `apps/web/src/chat/ChatPage.tsx`：sticky 三段布局 + MessageRow 路由。
- [x] 3.12 调整 `apps/web/src/main.tsx`、`apps/web/src/index.css`：ConfigProvider 主题映射 + 米白底色 + 加载 `qweather-icons.css`。

## 4. Validation

- [x] 4.1 `pnpm --filter @travel/web typecheck` 通过。
- [x] 4.2 `pnpm --filter @travel/server typecheck` 通过（确认未误改 server 类型）。
- [x] 4.3 手工验证空会话 / 完整三工具链 / 闲聊 fallback / 错误气泡 4 条路径。

## 5. Documentation

- [x] 5.1 不影响 `plans/` 任何文档（PRD §7 仅作为实现依据）。
- [x] 5.2 不涉及 `questions/`。
- [x] 5.3 此 change 的 proposal/design/tasks/spec 一致。
