# 卡片化 UI 改造方案

## Context

当前 assistant 回复只是流式 markdown + 自绘打字机。mock 给出的界面需要独立的卡片：目的地 hero、天气卡（含 7 日预报）、景点列表、推荐面板、快捷回复 chips。问题是现在的流式数据不够用：

- `WeatherSnapshot` 缺 humidity / windDir / windScale / visibility / 天气 icon code / 整体评估文案
- `Attraction` 缺描述、距离、缩略图、tags
- Hero（省/州/tagline/适合出行）和推荐面板 / chips 完全没有结构化数据
- SSE 只有 token / tool_start / tool_end / final / done，没有承载卡片的事件

因此需要一套新的数据交互：**工具层补齐原始字段 + 让 LLM 通过新增 `finalizeTripCard` 工具产出 narrative/chips + 新增 `card` SSE 事件**，前端用卡片组件组装。Markdown 打字机保留作 fallback（打招呼、工具失败等场景）。

## 数据契约

### packages/shared/src/travel.ts（扩展）
- `WeatherDaily` 增加 `iconCode?: string`（QWeather `iconDay`，形如 `"100"`、`"305"`）
- `WeatherSnapshot.current` 增加 `humidityPct: number` / `windDir: string` / `windScale: string` / `visibilityKm: number` / `iconCode: string`（QWeather `now.humidity/windDir/windScale/vis/icon`）
- `Attraction` 增加 `description?: string` / `distanceKm?: number` / `imageUrl?: string` / `tags?: string[]`
- 新增 `TripCard`：
  ```ts
  export interface TripCard {
    hero: { regionCode: string; regionPath: string; city: string; tagline: string; verdictBadge: string };
    weather: WeatherSnapshot & { summary: string };
    attractions: Attraction[];
    recommendation: { tag: string; headline: string; body: string };
    chips: string[]; // 恰好 4 条
  }
  ```

### packages/shared/src/chat.ts（扩展）
- `StreamEvent` 增加 `| { type: 'card'; card: TripCard }`
- `ToolName` 增加 `'finalizeTripCard'`（内部工具，不暴露给前端 tool trace）

## 天气 Icon 方案

- 资源已就位：`apps/web/assets/weather-icons/`
  - `qweather-icons.css`（class 形如 `.qi-100::before {...}`，content 取自 font）
  - `fonts/qweather-icons.{woff2,woff,ttf}`
  - `qweather-icons.json`（code → 名称映射，可选读取）
- 前端在 `apps/web/src/main.tsx`（入口）一次性 `import '../assets/weather-icons/qweather-icons.css'`，字体 URL 由 Vite 处理
- 渲染时用 `<i className={\`qi qi-${iconCode}\`} />`（需保留 `qi-` 前缀类），`iconCode` 直接来自 QWeather `now.icon` / `daily[].iconDay`（字符串，不加前导 0 处理）
- 无 code 兜底：`iconCode || '999'`（QWeather 999 为未知/其他）或隐藏 icon

## Backend 改造

### 工具字段补齐
- `apps/server/src/agent/tools/getWeather.ts`
  - 映射 `now.humidity → humidityPct`, `now.windDir/windScale`, `now.vis → visibilityKm`, `now.icon → iconCode`
  - 映射 `daily[].iconDay → iconCode`
  - `getLocation()` 返回的 `adm1 / adm2` 省/州信息由 `finalizeTripCard` 的 LLM 输入里复述（不污染 WeatherSnapshot）
- `apps/server/src/agent/tools/getAttractions.ts`
  - 升级到高德搜索 POI 2.0：endpoint 由 `https://restapi.amap.com/v3/place/text`（v3）切到 `https://restapi.amap.com/v5/place/text`（v5）
  - 参数名按 2.0 重排：
    - `city` → `region` + `city_limit=true`（精确城市内搜索）
    - `offset` → `page_size`（1-25，取 8）
    - `page` → `page_num`
    - `extensions=all` 弃用，改传 `show_fields=business,photos`（按需拉 business 评分字段 + photos 图片字段；留白可少流量）
  - POI 字段读取跟着改：
    - rating：`biz_ext.rating` → `business.rating`
    - 图片：`photos[0].url → imageUrl`
    - 分类标签：沿用 `type` 按 `;` split 成 `tags`
    - 坐标：`location` 形如 `"lng,lat"`，与城市中心（QWeather geo 拿到的 lat/lon，通过 getWeather 结果或再 geocode 一次）做 haversine 算 `distanceKm`；关键字搜索本身不会返回 `distance`，只有周边搜索才有
  - 返回数据校验不变：`status !== "1"` 视为业务错误，读 `info/infocode` 排障
  - 保持返回 `JSON.stringify` 格式以兼容 Moonshot（注释保留）

### 新工具 finalizeTripCard
- 新文件 `apps/server/src/agent/tools/finalizeTripCard.ts`
- Zod schema 对应 TripCard 的 narrative 部分：`hero.tagline / hero.regionCode / hero.regionPath / hero.verdictBadge / weather.summary / attractions[].description / recommendation{tag,headline,body} / chips[4]`
- 工具 body 直接 return 入参（容器做 schema 校验）
- 在 `apps/server/src/agent/graph.ts` 加入 `tools` 数组
- 在 `apps/server/src/agent/prompts.ts` 扩 system prompt：调用顺序必须是 `getWeather → getAttractions → finalizeTripCard`，强调 `chips` 必须 4 条、语气 / 字段含义

### SSE 合并
- `apps/server/src/routes/chat.ts` 的 `on_tool_end` 分支
  - 累积 `completedToolCalls = { weather?, attractions? }`
  - 当 `event.name === 'finalizeTripCard'` 时：合并 `weather` + `attractions` + finalize 入参 → 构造 `TripCard` → `emitEvent('card', { card })`
  - 抑制 finalizeTripCard 的 `tool_start / tool_end` 对外发送（白名单过滤）
- 事件顺序：`tool_start:getWeather → tool_end:getWeather → tool_start:getAttractions → tool_end:getAttractions → card → final({content:''}) → done`

## Frontend 改造

### useTravelAgent (apps/web/src/chat/useTravelAgent.ts)
- 扩展 `TravelChatMessage`，在 assistant 消息上加 `weather?: WeatherSnapshot`, `attractions?: Attraction[]`, `card?: TripCard`
- reducer 新增事件处理：
  - `tool_end:getWeather` → 当前 pending assistant 消息 `weather = result`
  - `tool_end:getAttractions` → `attractions = JSON.parse(result)`
  - `card` → `card = event.card`（完整数据覆盖 weather/attractions 的 narrative 字段）
- token 流照常累积到 `content`，但当存在 `card/weather/attractions` 时前端不再展示 markdown

### 卡片组件（新目录 apps/web/src/chat/cards/）

设计原则：**每个卡片都是独立可复用组件**，入参完全自包含；可单独使用也可由 `TripCardView` 组合。**每个卡片都接受 `loading?: boolean` 或在数据缺失时自动进入骨架态**，避免调用方各自实现占位。

- `DestinationHero.tsx`
  - props：`{ data?: TripCard['hero']; loading?: boolean }`
  - 数据态：region breadcrumb + h1 城市名 + tagline + 灰色斜纹 placeholder + `适合出行` badge
  - 骨架态：`<Skeleton.Image>` 占据 hero 位，`<Skeleton.Input size="small">` 代 breadcrumb，`<Skeleton paragraph={{ rows: 1 }}>` 代 tagline

- `WeatherCard.tsx`
  - props：`{ data?: WeatherSnapshot; summary?: string; loading?: boolean }`
  - 数据态：现场块（温度、状况、湿度、风向 + 等级、能见度 + `<i className="qi qi-{iconCode}">` 大图）+ 7 日格子（日期、小 qi icon、tMax/tMin、precipMm>0 显示"中雨"）+ summary 段（可缺省）
  - 骨架态：现场块用 `Skeleton.Avatar` + 两行 `Skeleton`；7 日格子用 7 个相同大小的灰色方块占位
  - summary 独立判断：`data` 已到但 `summary` 未到时仍显示完整天气卡，summary 区域显示一行 loading

- `AttractionList.tsx`
  - props：`{ items?: Attraction[]; loading?: boolean; placeholderCount?: number }`（默认 5）
  - 数据态：行布局——imageUrl 缩略（无则斜纹 placeholder）、名字 + category tag、description（可缺省）、右侧 ★ rating 和 distance
  - 骨架态：渲染 `placeholderCount` 个行级骨架（缩略图 + 两行文本）

- `RecommendationPanel.tsx`
  - props：`{ data?: TripCard['recommendation']; chips?: string[]; loading?: boolean; onChipClick: (text:string)=>void }`
  - 数据态：黑色 pill tag + headline + body + 下方 chip 按钮行（4 枚）
  - 骨架态：pill + 两行 `Skeleton` + 4 个等宽 chip 占位按钮（disabled）

- `TripCardView.tsx` — 组合器
  - props：`{ weather?: WeatherSnapshot; attractions?: Attraction[]; card?: TripCard; onChipClick: (text:string)=>void }`
  - 渲染顺序：Hero → WeatherCard → AttractionList → RecommendationPanel
  - 每个子卡片根据可用字段决定 `loading`：
    - Hero：`loading = !card` （card 到齐才有 hero）
    - WeatherCard：`loading = !weather && !card`；`data = card?.weather ?? weather`；`summary = card?.weather.summary`
    - AttractionList：`loading = !attractions && !card`；`items = card?.attractions ?? attractions`
    - RecommendationPanel：`loading = !card`；`data = card?.recommendation`；`chips = card?.chips`
  - 支持「只用其中一个卡片」的场景：直接 import 单个组件，不需要走 TripCardView

### ChatPage.tsx 集成
- `roles.assistant.contentRender` 改为闭包（在组件内部构造，持有 `messageById` 索引）
- 切换逻辑：
  - 消息状态仍是 `loading` 且工具还没开始 → 继续沿用现有 `正在思考中...` 文案（由 Bubble 内部处理）
  - 消息一旦进入 `updating` 且有意要走卡片流（可用 `pendingAssistantId === id` 判断）→ 切到 `<TripCardView>`，让每个卡片自己显示骨架；随着 `tool_end` / `card` 事件推进，骨架被替换成实际内容
  - 消息结束后仍没拿到 `weather/attractions/card`（例如非旅行问答）→ 走 `<MarkdownTyping>` 渲染 `content`
- `onChipClick = (text) => onRequest(text)`，与 Sender 的提交同路径
- MarkdownTyping 保留，仅在无结构化数据时使用

### 样式入口
- `apps/web/src/main.tsx` 增加 `import '../assets/weather-icons/qweather-icons.css'`（或放在 index.css 里）

## 关键文件
- `packages/shared/src/travel.ts`（扩类型 + TripCard）
- `packages/shared/src/chat.ts`（StreamEvent + ToolName）
- `apps/server/src/agent/tools/getWeather.ts`（字段补齐）
- `apps/server/src/agent/tools/getAttractions.ts`（字段补齐）
- `apps/server/src/agent/tools/finalizeTripCard.ts`（**新建**）
- `apps/server/src/agent/graph.ts`（注册工具）
- `apps/server/src/agent/prompts.ts`（强制调用顺序）
- `apps/server/src/routes/chat.ts`（合并 card 事件、过滤内部工具）
- `apps/web/src/chat/useTravelAgent.ts`（扩 state + 事件处理）
- `apps/web/src/chat/cards/DestinationHero.tsx`（**新建**）
- `apps/web/src/chat/cards/WeatherCard.tsx`（**新建**）
- `apps/web/src/chat/cards/AttractionList.tsx`（**新建**）
- `apps/web/src/chat/cards/RecommendationPanel.tsx`（**新建**）
- `apps/web/src/chat/cards/TripCardView.tsx`（**新建**）
- `apps/web/src/chat/ChatPage.tsx`（contentRender 切换 + chip 回调）
- `apps/web/src/main.tsx`（加载 qweather-icons.css）

## 验证

1. `pnpm dev`，浏览器打开 web。
2. 输入 "我想去西双版纳"，DevTools Network SSE 面板里应看到：
   - 进入 `updating`：页面已渲染 Hero / WeatherCard / AttractionList / RecommendationPanel 全部**骨架态**
   - `tool_end:getWeather` → WeatherCard 从骨架切为实际内容（温度、湿度、风向+等级、能见度、当前 qi-icon、7 日格 + qi-icon），summary 区仍为 loading
   - `tool_end:getAttractions` → AttractionList 从骨架切为实际景点行（缩略图、评分、距离、tags），描述仍为空
   - `card` → Hero 骨架切为实际内容；WeatherCard 的 summary 填入；每个景点补描述；RecommendationPanel 骨架切为实际 headline/body + 4 个 chips
   - `final` 空 content → `done`
3. 独立组件验证：在任意 demo 页面/Storybook 单独渲染 `<WeatherCard loading />`、`<AttractionList loading />`、`<RecommendationPanel loading onChipClick={...} />` 能独立显示骨架
4. 点任一 chip → 新 user 气泡为 chip 文案，重新触发完整流程
5. 故意 unset QWEATHER_API_KEY → 走 `error` 事件，fallback 到 MarkdownTyping 显示错误
6. 关闭页面中途 → server 日志 "客户端连接已断开"，不应 emit card
7. 字体加载：Network 面板确认 `qweather-icons.woff2` 成功加载；无 code 缺失时 fallback 到 `qi-999`
8. `pnpm --filter @travel/web build` 通过 TS 校验
