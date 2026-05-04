# 漫游 Web 移动端兼容技术方案

> 关联设计稿：[plans/2026-04-30/mobile-design.html](plans/2026-04-30/mobile-design.html)（iPhone 390 × 844，5 屏：空对话、地点+天气+景点、不建议出行、行程规划、侧边抽屉）。
> 本方案完成后需将该 md 复制到 `plans/2026-04-30/` 归档。

---

## 1. Context

- 当前前端 [apps/web](apps/web/) 是桌面优先布局：`.travel-chat-page` 写死 `100vw/100vh`；`.travel-chat-content`、`.travel-topbar__inner`、`.travel-inputbar__inner` 统一使用 `--travel-layout-content-max-width: 960px`；除 [AttractionList.less:203](apps/web/src/chat/cards/AttractionList/AttractionList.less:203) 外没有任何移动端断点。
- 在 iPhone 13 mini（390px）下会出现：横向出现滚动条（`100vw`+滚动条宽度溢出）、用户气泡 70% 宽度过窄、欢迎卡 3 个能力卡 `flex:1` 被挤压、Hero 标题 24px+padding 24px 显得拥挤、底部输入栏不避让 home indicator、TopBar 字号偏小。
- 目标：**仅前端 CSS / 极少量 TSX 调整**，让现有桌面 PC 版本同时在 ≤720px 视口下完美呈现设计稿效果；server / SSE / agent / shared 类型 **不动**。
- 范围排除项（用户明确指定）：
  - 不实现"近期对话"列表、抽屉数据层；
  - 不实现 TopBar 左上角"打开近期对话"按钮 → 移动端隐藏汉堡入口（PC 端原本也无此按钮，保持一致）。

## 2. Goals / Non-Goals

**Goals**
- 单一断点 `@media (max-width: 720px)`（沿用 [AttractionList.less:203](apps/web/src/chat/cards/AttractionList/AttractionList.less:203) 既有约定）。
- TopBar、ChatScroll、UserBubble、WelcomeCard、DestinationHero、WeatherCard、AttractionList、ItineraryCard、InputBar 在 390px 下 1:1 对齐设计稿。
- 解决全局 `100vw` 横向溢出与 iOS 底部安全区。
- 桌面 (>720px) 视觉与现状完全一致（零回归）。

**Non-Goals**
- 不引入 CSS-in-JS / 新依赖 / 容器查询；不重构 less 模块结构。
- 不改 server 端 / 类型 / SSE 协议。
- 不实现侧边抽屉、近期对话历史、汉堡按钮交互。
- 不做 mobile-first 重写，采用"桌面基线 + 移动覆盖"策略，最小入侵。

## 3. Approach 概览

1. **新增设计 token**（[apps/web/src/theme/tokens.less](apps/web/src/theme/tokens.less)）：`--travel-bp-mobile: 720px`（注释，仅作约定记录）、`--travel-layout-input-pad-bottom-mobile: 88px`、`--travel-layout-topbar-height-mobile: 52px`、`--travel-safe-bottom: env(safe-area-inset-bottom, 0px)`。
2. **修复全局溢出**：`html, body, #root` 已是 100% 不动；改 `.travel-chat-page` 的 `width: 100vw` → `width: 100%`，并加 `overflow-x: hidden`，避免滚动条溢出。
3. **viewport meta 增强**（[apps/web/index.html](apps/web/index.html)）：在现有 `width=device-width, initial-scale=1.0` 基础上追加 `viewport-fit=cover`，开启 `env(safe-area-inset-*)`。
4. **每个组件 less 文件追加 `@media (max-width: 720px)` 块**，覆盖：内边距、字号、grid 列宽、最大宽度、`flex-wrap`、隐藏/缩小 PC 才有的元数据。
5. **TopBar 移动端文案布局调整**：标题居中（设计稿即如此），meta（`在线 · 天气实时`）改为副标题；不渲染汉堡按钮（默认就没有，无需改 TSX）。
6. **WelcomeCard 能力卡**：移动端从 3 列等分 `flex:1` 改为 `flex: 1 1 calc(33.333% - 8px)` + 缩小 padding/字号；保留 PC 行为。
7. **InputBar 安全区**：`padding-bottom` 加 `calc(var(--travel-space-md) + var(--travel-safe-bottom))`。

> ⚠️ 仅 CSS 改动，无新增 TSX 文件；无 props / 接口变更。

## 4. 详细改动清单

### 4.1 全局基础

**[apps/web/index.html](apps/web/index.html)**
- 替换 viewport meta：`<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />`

**[apps/web/src/theme/tokens.less](apps/web/src/theme/tokens.less)**（在 `:root` 末尾追加）
```less
/* 移动端布局 */
--travel-layout-topbar-height-mobile: 52px;
--travel-layout-input-pad-bottom-mobile: 88px;
--travel-safe-bottom: env(safe-area-inset-bottom, 0px);
--travel-safe-top: env(safe-area-inset-top, 0px);
```

### 4.2 [apps/web/src/chat/ChatPage/ChatPage.less](apps/web/src/chat/ChatPage/ChatPage.less)

- L3：`width: 100vw` → `width: 100%`；新增 `overflow-x: hidden`。
- 文件末尾追加：
```less
@media (max-width: 720px) {
  .travel-chat-content {
    padding: var(--travel-space-md) var(--travel-space-md) 0;
    gap: var(--travel-space-md);
  }
  .travel-chat-scroll {
    padding-bottom: var(--travel-layout-input-pad-bottom-mobile);
  }
  .travel-user-bubble {
    max-width: 85%;
    font-size: 14px;
  }
  .travel-assistant-avatar { width: 24px; height: 24px; font-size: 12px; }
}
```

### 4.3 [apps/web/src/chat/TopBar/TopBar.less](apps/web/src/chat/TopBar/TopBar.less)

末尾追加：
```less
@media (max-width: 720px) {
  .travel-topbar {
    height: var(--travel-layout-topbar-height-mobile);
    padding-top: var(--travel-safe-top);
  }
  .travel-topbar__inner {
    padding: 0 var(--travel-space-md);
    justify-content: center;        /* 设计稿：标题居中 */
    text-align: center;
  }
  .travel-topbar__title { font-size: 15px; }
  .travel-topbar__meta {
    font-size: 10px;
    letter-spacing: 0.08em;
  }
  .travel-topbar__status { display: none; } /* 移动端隐藏右侧在线徽章，状态收进 meta */
}
```
> 设计稿在标题下方显示 `在线 · 天气实时`，与现有 `__meta` 文案一致；右侧"在线/离线"徽章在移动端冗余，隐藏。

### 4.4 [apps/web/src/chat/InputBar/InputBar.less](apps/web/src/chat/InputBar/InputBar.less)

末尾追加：
```less
@media (max-width: 720px) {
  .travel-inputbar__inner {
    padding: var(--travel-space-sm) var(--travel-space-md)
             calc(var(--travel-space-md) + var(--travel-safe-bottom));
  }
  .travel-inputbar__hint { font-size: 10px; }
}
```

### 4.5 [apps/web/src/chat/cards/CardContainer/CardContainer.less](apps/web/src/chat/cards/CardContainer/CardContainer.less)

末尾追加：
```less
@media (max-width: 720px) {
  /* AntD Card body 默认 padding；按设计稿统一缩到 16px */
  .ant-card .ant-card-body { padding: var(--travel-space-md); }
}
```
> 注：当前 CardContainer 走 antd Card；如发现 less 没有引用 `.ant-card`，则在 [apps/web/src/index.less](apps/web/src/index.less) 末尾追加同样的 mobile media block，统一收口。

### 4.6 [apps/web/src/chat/cards/WelcomeCard/WelcomeCard.less](apps/web/src/chat/cards/WelcomeCard/WelcomeCard.less)

末尾追加：
```less
@media (max-width: 720px) {
  .travel-welcome__intro { font-size: 14px; line-height: 1.65; }
  .travel-welcome__capabilities { gap: var(--travel-space-xs); }
  .travel-welcome-capability__inner {
    flex-direction: column;       /* 设计稿单列：图标在上、文字在下 */
    align-items: flex-start;
    gap: 6px;
    padding: 10px 12px;
  }
  .travel-welcome-capability__icon { width: 24px; height: 24px; font-size: 14px; }
  .travel-welcome-capability__title { font-size: 13px; }
  .travel-welcome-capability__subtitle { font-size: 11px; }
  .travel-welcome__suggestion { font-size: 12px; padding: 5px 10px; }
}
```

### 4.7 [apps/web/src/chat/cards/DestinationHero/DestinationHero.less](apps/web/src/chat/cards/DestinationHero/DestinationHero.less)

末尾追加：
```less
@media (max-width: 720px) {
  .travel-destination-hero__media { height: 132px; }
  .travel-destination-hero__body {
    padding: var(--travel-space-md);
    flex-direction: row;
    align-items: flex-start;
    gap: var(--travel-space-sm);
  }
  .travel-destination-hero__title { font-size: 20px; margin: 4px 0; }
  .travel-destination-hero__desc { font-size: 13px; line-height: 1.55; }
  .travel-verdict-badge { font-size: 11px; padding: 4px 10px; }
}
```

### 4.8 [apps/web/src/chat/cards/WeatherCard/WeatherCard.less](apps/web/src/chat/cards/WeatherCard/WeatherCard.less)

末尾追加：
```less
@media (max-width: 720px) {
  .travel-weather-current__temp-value { font-size: 28px; }
  .travel-weather-current__main { gap: var(--travel-space-sm); }
  .travel-weather-icon--lg { font-size: 36px; }
  .travel-weather-current__meta { gap: var(--travel-space-sm); flex-wrap: wrap; }

  /* 7 列对 390px 视口宽度足够（≈ 50px / col），仅缩字号与内边距 */
  .travel-weather-day { padding: 6px 2px; }
  .travel-weather-day__weekday,
  .travel-weather-day__temp { font-size: 11.5px; }
  .travel-weather-day__date { font-size: 10px; }
  .travel-weather-icon--sm { font-size: 18px; }

  .travel-weather-summary { font-size: 12px; padding: 10px 12px; }
}
```

### 4.9 [apps/web/src/chat/cards/AttractionList/AttractionList.less](apps/web/src/chat/cards/AttractionList/AttractionList.less)

**已存在 `@media (max-width: 720px)` 块（L203-260），保持不动**。仅需 review 是否覆盖到设计稿新增的视觉差异；当前实现已满足"图片 72px + 信息行"，无需调整。

### 4.10 [apps/web/src/chat/cards/ItineraryCard/ItineraryCard.less](apps/web/src/chat/cards/ItineraryCard/ItineraryCard.less)

末尾追加：
```less
@media (max-width: 720px) {
  .travel-itinerary { padding: 14px 14px 16px; }
  .travel-itinerary__header { padding-bottom: 10px; margin-bottom: 12px; }
  .travel-itinerary__title { font-size: 14px; }
  .travel-itinerary__meta { font-size: 10px; }
  .travel-itinerary-day:not(:last-child) { margin-bottom: 18px; }
  .travel-itinerary-day__subtitle { font-size: 13px; }
  .travel-itinerary-item { grid-template-columns: 14px minmax(0, 1fr); gap: 10px; }
  .travel-itinerary-item__node { width: 14px; height: 14px; }
  .travel-itinerary-timeline__rail { left: 10px; }
  .travel-itinerary-item__title { font-size: 13px; }
  .travel-itinerary-item__desc { font-size: 12px; }
  .travel-itinerary__footnote { font-size: 12px; }
}
```

### 4.11 [apps/web/src/chat/cards/RecommendationPanel/RecommendationPanel.less](apps/web/src/chat/cards/RecommendationPanel/RecommendationPanel.less)

如该面板出现在移动端（设计稿未直接呈现独立面板），按需追加同样的 `@media (max-width: 720px)` 块，将内边距收到 `--travel-space-md`、字号下调 1px。**实现时先看是否被引用，无引用就跳过本步**。

## 5. 关键约定

- **断点**：统一使用 `@media (max-width: 720px)`，不引入额外断点（避免碎片化）。720px 与 [AttractionList.less:203](apps/web/src/chat/cards/AttractionList/AttractionList.less:203) 一致。
- **桌面零回归**：所有改动都是末尾追加 media query；唯一的"非追加"改动是 [ChatPage.less:3](apps/web/src/chat/ChatPage/ChatPage.less:3) 的 `100vw → 100%`（语义等价 + 避免溢出，桌面无视觉影响）。
- **每个新 less 块都要写一行注释**（项目规范：函数/模块都要注释；这里给 `@media` 块加 1 行说明用途即可）。
- **不改 TSX 结构**：所有现有组件的 DOM/props 不变，纯样式覆盖。

## 6. 关键文件清单

| 文件 | 改动类型 |
|---|---|
| [apps/web/index.html](apps/web/index.html) | viewport-fit=cover |
| [apps/web/src/theme/tokens.less](apps/web/src/theme/tokens.less) | 追加 4 个移动端 token |
| [apps/web/src/chat/ChatPage/ChatPage.less](apps/web/src/chat/ChatPage/ChatPage.less) | 修溢出 + 追加 media |
| [apps/web/src/chat/TopBar/TopBar.less](apps/web/src/chat/TopBar/TopBar.less) | 追加 media |
| [apps/web/src/chat/InputBar/InputBar.less](apps/web/src/chat/InputBar/InputBar.less) | 追加 media（含 safe-area） |
| [apps/web/src/chat/cards/CardContainer/CardContainer.less](apps/web/src/chat/cards/CardContainer/CardContainer.less) | 追加 media |
| [apps/web/src/chat/cards/WelcomeCard/WelcomeCard.less](apps/web/src/chat/cards/WelcomeCard/WelcomeCard.less) | 追加 media |
| [apps/web/src/chat/cards/DestinationHero/DestinationHero.less](apps/web/src/chat/cards/DestinationHero/DestinationHero.less) | 追加 media |
| [apps/web/src/chat/cards/WeatherCard/WeatherCard.less](apps/web/src/chat/cards/WeatherCard/WeatherCard.less) | 追加 media |
| [apps/web/src/chat/cards/ItineraryCard/ItineraryCard.less](apps/web/src/chat/cards/ItineraryCard/ItineraryCard.less) | 追加 media |
| [apps/web/src/chat/cards/AttractionList/AttractionList.less](apps/web/src/chat/cards/AttractionList/AttractionList.less) | 无改动（review） |

## 7. 验证（Verification）

1. **本地开发**：在 [apps/web](apps/web/) 运行 `pnpm dev`（项目根 `pnpm -F web dev`），打开 http://localhost:5173。
2. **桌面回归**：浏览器宽 ≥1024px，对照当前 main 分支截图，确认 TopBar / Welcome / TripCard / Itinerary 视觉与改动前完全一致。
3. **移动端验收**：Chrome DevTools 切换到 iPhone 13 (390 × 844)，逐屏对照 [plans/2026-04-30/mobile-design.html](plans/2026-04-30/mobile-design.html)：
   - 屏 1：欢迎卡能力卡纵向排布、suggestion chip 字号、底部 InputBar 避让 home indicator。
   - 屏 2：地点+天气+景点卡完整可见、7 日预报不挤、AttractionList 已用 720px 断点。
   - 屏 3：不建议 verdict 徽章对齐 hero 顶部。
   - 屏 4：ItineraryCard 时间轴节点 14px、Day 标签清晰、不溢出。
4. **横向滚动检查**：DevTools Console 执行 `document.documentElement.scrollWidth === document.documentElement.clientWidth` 应为 `true`。
5. **真机抽检**（可选）：iOS Safari 打开 `http://<开发机 IP>:5173`，确认安全区与 viewport-fit。
6. **构建产物**：`pnpm -F web build && pnpm -F web preview`，再次手机/模拟器跑一遍，确保 PostCSS 处理 less 后无 media query 丢失。

## 8. 后续动作

- 实施完成后，将本计划文件 `cp` 到 [plans/2026-04-30/mobile-responsive-plan.md](plans/2026-04-30/) 归档（项目 CLAUDE.md 规则）。
- 如未来需要"近期对话抽屉" / 汉堡入口，建议另起 plan，单独迭代抽屉组件 + 状态层。
