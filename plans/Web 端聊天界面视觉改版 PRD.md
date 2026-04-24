# Web 端聊天界面视觉改版 PRD

> 版本：v0.1 · 日期：2026-04-24 · 范围：`apps/web`（仅前端）+ 少量 `packages/shared` 协议扩展

---

## 1. 背景（Context）

当前前端仅把助手消息按 Markdown 流式渲染（[ChatPage.tsx:33](apps/web/src/chat/ChatPage.tsx:33) 使用 `XMarkdown` + 打字机效果），视觉上是"一个标题 + 一串气泡"，单调、信息密度低。

但后端 SSE 实际已经回推了结构化数据：

- `tool_end` 事件里 `result` 对应 [WeatherSnapshot](packages/shared/src/travel.ts:16) 或 `Attraction[]`（参见 [chat.ts:404-419](apps/server/src/routes/chat.ts:404)）；
- [TravelVerdict](packages/shared/src/travel.ts:28) 类型已经存在，但尚未在流里单独广播。

**目标**：把这些结构化数据变成与设计稿对齐的卡片化呈现，形成"欢迎卡 → 地点卡 / 天气卡 / 景点卡 / 总结卡"的复合会话 UI，同时补上吸顶 TopBar 和吸底输入框的骨架，调整整体主题色调。

改版后的关键预期：

1. 新会话默认渲染 **欢迎卡**，展示品牌、能力分类与示例 prompt。
2. 助手回复不再是一段纯 markdown，而是由 **地点 / 天气 / 景点 / 总结** 四张子卡组成的复合消息（根据工具执行情况按需渲染）。
3. **TopBar 吸顶**，展示会话标题、元信息、系统状态；**输入框吸底**，并附底部辅助说明。
4. 页面主题从默认 AntD 蓝 + `#f5f5f5` 灰切到米白 + 墨绿点缀的"漫游"主题。

---

## 2. 范围与非范围

**在范围**
- `apps/web/src/` 下的布局、组件、样式、SSE 消费层重构。
- `packages/shared` 新增 / 扩展 `StreamEvent` 的类型声明。
- `apps/server/src/routes/chat.ts` 中新增 `location` / `verdict` 两类事件的落点（仅下发点埋点，具体业务解析暂用兜底逻辑，详细见 §7）。
- 欢迎卡、地点卡、天气卡、景点卡、总结卡 5 个新组件。

**非范围**
- Agent 模型 / 工具本身的改造（`apps/server/src/agent/*` 不动结构，只在 chat 路由组织事件）。
- 鉴权、历史会话列表、多会话持久化。
- 移动端适配的完整走查（本轮按 ≥960px 桌面宽度设计，移动端仅做基础响应式折叠）。
- i18n（文案全中文硬编码，复用 [main.tsx:12](apps/web/src/main.tsx:12) 的 zhCN ConfigProvider）。

---

## 3. 设计令牌（Design Tokens）

在 [main.tsx](apps/web/src/main.tsx) 中扩展 `ConfigProvider theme`，并新增 `apps/web/src/theme/tokens.ts` 统一导出供卡片 CSS 使用。

| 令牌 | 值 | 用途 |
|---|---|---|
| `colorBg` | `#FAFAF7` | 全局米白底 |
| `colorSurface` | `#FFFFFF` | 卡片底色 |
| `colorSurfaceAlt` | `#F4F1EA` | 次级底（Hero 占位、tag 底） |
| `colorBrand` | `#1F8A5B` | 主品牌绿（"适合出行"、状态 pill） |
| `colorBrandSoft` | `#E6F4EC` | 品牌浅底 |
| `colorInk` | `#1A1A1A` | 主要文字 |
| `colorInkMuted` | `#6B6B6B` | 次要文字 |
| `colorStroke` | `#E6E3DB` | 描边、分隔线 |
| `tagPink` | `#F7D6CC` / `#8A3B2A` | 景点推荐分类 |
| `tagBlue` | `#CFE2EC` / `#295A73` | 天气查询分类 |
| `tagSand` | `#D9CDB6` / `#4A3A1F` | 出行建议分类 |
| `radiusCard` | `16px` | 所有卡片圆角 |
| `radiusChip` | `999px` | 胶囊按钮 |
| `shadowCard` | `0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(0,0,0,.04)` | 卡片悬浮感 |
| `fontFamily` | 保持 [index.css:14](apps/web/src/index.css:14) 现有 stack | — |
| `spacing.x` | 4 / 8 / 12 / 16 / 24 / 32 | 统一间距梯度 |

AntD Token 映射：`token.colorPrimary = colorBrand`、`token.borderRadius = 12`、`token.colorBgLayout = colorBg`。

---

## 4. 整体布局（Shell）

三段式 flex 列布局，替代 [ChatPage.tsx:91-125](apps/web/src/chat/ChatPage.tsx:91) 目前的单块 flex。

```
┌─ TopBar（position: sticky; top:0; z:10; height:56px）──────────────┐
│ 左：会话标题（西双版纳 · 五一前出行）                                │
│       · THREAD · 7 MESSAGES · UPDATED 14:34（小字 meta）             │
│ 右：在线 pill（绿点 + "在线 · 天气数据实时"）                        │
├─ ScrollArea（flex:1; overflow:auto; padding:24 0 120）──────────────┤
│   WelcomeCard（首屏 / 空消息列表时展示）                             │
│   AssistantComposite（每轮助手回复的复合卡）                         │
│   UserBubble                                                         │
│   …                                                                  │
├─ InputBar（position: sticky; bottom:0; z:10; padding:12 16 16）─────┤
│   <Sender> + helper hint（按 ENTER 发送 · SHIFT+ENTER 换行…）        │
└──────────────────────────────────────────────────────────────────────┘
```

关键实现点：
- 外层容器高度为 `100vh`，TopBar 与 InputBar 使用 `position: sticky`（而非 fixed）搭配 flex 列，避免窗口滚动时 fixed 覆盖内容。
- ScrollArea 设 `padding-bottom: 96px`，防止最后一条被输入框遮挡；输入框本身带上 `backdrop-filter: blur(12px)` 与 `background: rgba(250,250,247,.9)` 形成与聊天区的过渡。
- 内容宽度 `max-width: 960px; margin: 0 auto;`（保留现有）。

---

## 5. 组件规格

### 5.1 TopBar `apps/web/src/chat/TopBar.tsx`（新）

Props：`{ title: string; messageCount: number; updatedAt: Date; online: boolean }`

- 左：标题 18px/600，`MetaLine`（THREAD · X MESSAGES · UPDATED HH:mm，11px 全大写，`colorInkMuted`）。
- 右：`StatusPill` 胶囊（绿底 `colorBrandSoft` + 深绿文字 `colorBrand`，左侧 6px 圆点），文案 "在线 · 天气数据实时"。
- `title` / `messageCount` / `updatedAt` 从 `useTravelAgent().messages` 派生（标题默认 "漫游 · 旅行建议"，若首条 user 有内容则取前 16 字 + 时段后缀）。

### 5.2 WelcomeCard `apps/web/src/chat/cards/WelcomeCard.tsx`（新）

**触发条件**：`messages.length === 0`。

结构（参照设计稿）：
1. 头像 + "漫游助手" 标题 + 14:28 时间戳。
2. 一段欢迎语：「你好，欢迎踏上新的旅程。我是 **漫游**——你的行程规划伙伴，擅长把一个城市名字变成一份可执行的出行建议。」
3. 三个能力卡（横向 flex，gap 12）：
   - 景点推荐（`tagPink`，图标 pin）+ 副标 "值得打卡的去处"
   - 天气查询（`tagBlue`，图标 cloud）+ 副标 "实时 + 7 日预报"
   - 出行建议（`tagSand`，图标 sparkle）+ 副标 "季节与当季贴士"
4. 提示行："告诉我想去的城市或地区，或试试下方的建议 ↓"
5. 快捷 chips（点击即触发 `onRequest`）：`['成都四月好去处','京都赏樱','冰岛极光最佳月份','日本东北温泉']`。

### 5.3 LocationCard `apps/web/src/chat/cards/LocationCard.tsx`（新）

Props：`{ hero?: string; region: string; provinceChain: string[]; name: string; subtitle: string; verdictBadge?: 'good' | 'caution' | 'avoid' }`

- 顶部 Hero：160px 高条纹斜线占位图（`repeating-linear-gradient`），左上角 "PLACEHOLDER" 标签；未来若有 `hero` URL 则替换。
- Meta：`YN · 云南省 · 傣族自治州`（`colorInkMuted`，11px 全大写 letter-spacing .08em）。
- 主标：24px/700。
- 副标：14px/400，`colorInkMuted`。
- 右上角 badge：`verdictBadge='good'` → 绿色 "适合出行"；`caution` → 琥珀 "谨慎出行"；`avoid` → 红 "不建议出行"。

### 5.4 WeatherCard `apps/web/src/chat/cards/WeatherCard.tsx`（新）

Props：`WeatherSnapshot`（已有类型）+ `overallVerdict?: string`。

- 上半：超大当前温度 `32px/700`（°C 小字），左侧天气图标；右侧三项 meta：湿度 `78%`、风向风速 `东南 2 级`、能见度 `6 km`。
  - 当前后端 `current` 只含 `tempC/condition/windKph`；湿度/能见度先用"—"兜底，或在 `getWeather` 工具结果中补字段。
- 下半：7 日预报横向等宽网格（7 列），每列：星期（今/四/五…）+ 日期（4/23）+ 图标 + `tMax° tMin°`。
  - 星期用 `Intl.DateTimeFormat('zh-CN', { weekday: 'narrow' })`。
  - 图标根据 `condition` 做枚举 → icon 映射（多云/晴/中雨/阵雨…）。
- 底部："整体评估"：灰底 box，显示 `overallVerdict`（由助手汇总生成）。未提供时折叠不显示。

### 5.5 AttractionsCard `apps/web/src/chat/cards/AttractionsCard.tsx`（新）

Props：`{ items: Attraction[]; city: string }`

- 头部：`值得停留的地方` 图标标题 + 右侧 `7 / 精选`（灰字）。
- 每行：48×48 条纹缩略图占位 + 名称（15/600）+ 分类 tag（多色枚举 `category → tag color`，见下）+ 评分 ⭐ + 距离（第一期用 `—` 或省略）。
- 副行：一句简介（当前 `Attraction` 无 description 字段，临时用 `${category} · ${address ?? '市中心'}` 拼装）。
- tag 颜色枚举：`人文街区/园林古迹/寺庙/宗教建筑/植物园/城市广场/滨江休闲` 各自一组柔和底色；缺省色灰。

### 5.6 VerdictCard `apps/web/src/chat/cards/VerdictCard.tsx`（新）

Props：`TravelVerdict & { headline: string; followUps?: string[] }`

- 顶部 `StatusPill`：`goodTimeToVisit=true` → 绿 "推荐 · 近期出发"；false → 琥珀 "谨慎 · 建议调整"。
- 标题：`此刻是否出发`。
- 正文：`reason`（段落，预留 mark 黄色高亮 span：给关键日期如 `4/26` 加 `<mark>`）。
- 下方 follow-ups chip 组（可点即触发 `onRequest`）：`['4/26 改为室内有什么好去处？','泼水节活动详情','从成都出发的机票与路线','推荐三天两夜行程']`。

### 5.7 AssistantComposite `apps/web/src/chat/cards/AssistantComposite.tsx`（新）

将上述 5.3–5.6 组合为**一个**助手消息块（取代现在的单个 `Bubble`）。

- 渲染顺序：Location → Weather → Attractions → Verdict。
- 每个子块可独立显隐：流式阶段先出 Location 骨架，工具到齐再填充 Weather / Attractions / Verdict。
- 兜底：如果本轮没有任何结构化数据（纯 LLM 文本），退化成保留现有 `XMarkdown` 气泡（保留打字机效果，[ChatPage.tsx:12](apps/web/src/chat/ChatPage.tsx:12)）。

### 5.8 UserBubble

沿用 AntD X `Bubble` role='user'，仅覆盖样式：深墨绿 `#1A1A1A` 底 + 白字 + 14px 圆角、max-width 70%、右对齐。

### 5.9 InputBar `apps/web/src/chat/InputBar.tsx`（新）

包装 `<Sender>`：
- placeholder：`想去哪里？告诉我城市、时段或一种心情…`
- 顶部加一条细渐变分隔线（`linear-gradient(to bottom, transparent, rgba(0,0,0,.04))`）。
- 输入框下方 helper hint（11px，`colorInkMuted`，居中）：`按 ENTER 发送 · SHIFT + ENTER 换行 · 天气数据来自公开气象 API`。
- `loading` 绑定 `isRequesting`。

---

## 6. Backend 技术方案

> 本章节内容映射自 [plans/markdown-synthetic-sloth.md](markdown-synthetic-sloth.md)。补齐原始字段 + 新增 `finalizeTripCard` 工具产出 narrative / chips + 新增 `card` SSE 事件，前端据此组装卡片。

### 6.1 数据契约扩展

`packages/shared/src/travel.ts`（扩展）：

- `WeatherDaily` 增加 `iconCode?: string`（QWeather `iconDay`，如 `"100"`、`"305"`）。
- `WeatherSnapshot.current` 增加 `humidityPct: number` / `windDir: string` / `windScale: string` / `visibilityKm: number` / `iconCode: string`（对应 QWeather `now.humidity / windDir / windScale / vis / icon`）。
- `Attraction` 增加 `description?: string` / `distanceKm?: number` / `imageUrl?: string` / `tags?: string[]`。
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

`packages/shared/src/chat.ts`（扩展）：

- `StreamEvent` 增加 `| { type: 'card'; card: TripCard }`。
- `ToolName` 增加 `'finalizeTripCard'`（内部工具，不暴露到前端 tool trace）。

### 6.2 工具字段补齐

**`apps/server/src/agent/tools/getWeather.ts`**
- 映射 QWeather `now.humidity → humidityPct`、`now.windDir / windScale`、`now.vis → visibilityKm`、`now.icon → iconCode`。
- 映射 `daily[].iconDay → iconCode`。
- `getLocation()` 返回的 `adm1 / adm2`（省 / 州）不污染 `WeatherSnapshot`，由 `finalizeTripCard` 的 LLM 输入里复述。

**`apps/server/src/agent/tools/getAttractions.ts`**
- 升级到高德搜索 POI 2.0：endpoint 由 `https://restapi.amap.com/v3/place/text`（v3）切换到 `https://restapi.amap.com/v5/place/text`（v5）。
- 参数按 2.0 重排：
  - `city` → `region` + `city_limit=true`（精确城市内搜索）
  - `offset` → `page_size`（1–25，取 8）
  - `page` → `page_num`
  - `extensions=all` 弃用，改传 `show_fields=business,photos`（按需拉 business 评分字段 + photos 图片字段）
- POI 字段读取跟着改：
  - rating：`biz_ext.rating` → `business.rating`
  - 图片：`photos[0].url → imageUrl`
  - 分类标签：沿用 `type` 按 `;` split 成 `tags`
  - 坐标：`location` 形如 `"lng,lat"`，与城市中心（QWeather `getLocation` 拿到的 lat/lon）做 haversine 算 `distanceKm`；关键字搜索本身不返回 `distance`，只有周边搜索才有。
- 业务校验不变：`status !== "1"` 视为错误，读 `info / infocode` 排障。
- 返回保持 `JSON.stringify` 格式以兼容 Moonshot（原注释保留）。

### 6.3 新增 `finalizeTripCard` 工具

- 新文件 `apps/server/src/agent/tools/finalizeTripCard.ts`。
- Zod schema 对应 `TripCard` 的 narrative 部分：`hero.tagline / hero.regionCode / hero.regionPath / hero.verdictBadge / weather.summary / attractions[].description / recommendation { tag, headline, body } / chips[4]`。
- 工具 body 直接 `return` 入参（容器层做 schema 校验）。
- `apps/server/src/agent/graph.ts` 的 `tools` 数组中注册该工具。
- `apps/server/src/agent/prompts.ts` 扩 system prompt：强制调用顺序 `getWeather → getAttractions → finalizeTripCard`；强调 `chips` 必须 4 条、语气要求与字段含义。

### 6.4 SSE 合并与事件顺序

`apps/server/src/routes/chat.ts` 的 `on_tool_end` 分支：

- 累积 `completedToolCalls = { weather?, attractions? }`。
- 当 `event.name === 'finalizeTripCard'` 时：合并 `weather` + `attractions` + finalize 入参 → 构造 `TripCard` → `emitEvent('card', { card })`。
- 白名单过滤：`finalizeTripCard` 自身的 `tool_start / tool_end` 不对外下发。
- 事件顺序（正常流）：

  ```
  tool_start:getWeather
  → tool_end:getWeather
  → tool_start:getAttractions
  → tool_end:getAttractions
  → card
  → final({ content: '' })
  → done
  ```

### 6.5 Backend 改动清单

- `packages/shared/src/travel.ts`（扩类型 + `TripCard`）
- `packages/shared/src/chat.ts`（`StreamEvent` + `ToolName`）
- `apps/server/src/agent/tools/getWeather.ts`（字段补齐）
- `apps/server/src/agent/tools/getAttractions.ts`（高德 v5 + 字段补齐）
- `apps/server/src/agent/tools/finalizeTripCard.ts`（**新建**）
- `apps/server/src/agent/graph.ts`（注册工具）
- `apps/server/src/agent/prompts.ts`（强制调用顺序 + chips 要求）
- `apps/server/src/routes/chat.ts`（`card` 事件合并、内部工具白名单过滤）

---

## 7. Frontend 技术方案

> 本章节内容映射自 [plans/markdown-synthetic-sloth.md](markdown-synthetic-sloth.md)。核心思路：**每个卡片都是独立可复用组件，自带骨架态**，由 `TripCardView` 组合；Markdown 打字机保留作为无结构化数据的 fallback。

### 7.1 状态管理 `useTravelAgent`

`apps/web/src/chat/useTravelAgent.ts`：

- 扩展 `TravelChatMessage`，在 assistant 消息上增加 `weather?: WeatherSnapshot` / `attractions?: Attraction[]` / `card?: TripCard`。
- reducer 新增事件处理：
  - `tool_end:getWeather` → 当前 pending assistant 消息的 `weather = result`
  - `tool_end:getAttractions` → `attractions = JSON.parse(result)`
  - `card` → `card = event.card`（完整数据，覆盖 `weather / attractions` 对应的 narrative 字段）
- `token` 流照常累积到 `content`，但存在 `card / weather / attractions` 时前端不再展示 markdown（只作 fallback 留存）。

### 7.2 天气 Icon 使用

- 资源已就位：`apps/web/assets/weather-icons/`
  - `qweather-icons.css`（class 形如 `.qi-100::before { ... }`，`content` 取自字体）
  - `fonts/qweather-icons.{woff2,woff,ttf}`
  - `qweather-icons.json`（code → 名称映射，可选读取）
- 在 `apps/web/src/main.tsx` 入口一次性 `import '../assets/weather-icons/qweather-icons.css'`，字体 URL 由 Vite 处理。
- 渲染：`<i className={\`qi qi-${iconCode}\`} />`（必须保留 `qi-` 前缀类）；`iconCode` 直接来自 QWeather `now.icon` / `daily[].iconDay`（字符串，不做前导 0 处理）。
- 兜底：`iconCode || '999'`（QWeather `999` 为未知 / 其他）或隐藏 icon。

### 7.3 组件抽离（新目录 `apps/web/src/chat/cards/`）

**设计原则**：每个卡片都是独立可复用组件，入参完全自包含；可单独使用，也可由 `TripCardView` 组合。**每个卡片都接受 `loading?: boolean` 或在数据缺失时自动进入骨架态**，避免调用方各自实现占位。

#### 7.3.1 `DestinationHero.tsx`

- props：`{ data?: TripCard['hero']; loading?: boolean }`
- 数据态：region breadcrumb + h1 城市名 + tagline + 灰色斜纹 placeholder + `适合出行` badge。
- 骨架态：`<Skeleton.Image>` 占 hero 位；`<Skeleton.Input size="small">` 代 breadcrumb；`<Skeleton paragraph={{ rows: 1 }}>` 代 tagline。

#### 7.3.2 `WeatherCard.tsx`

- props：`{ data?: WeatherSnapshot; summary?: string; loading?: boolean }`
- 数据态：现场块（温度、状况、湿度、风向 + 等级、能见度 + `<i className="qi qi-{iconCode}">` 大图）+ 7 日格子（日期、小 `qi` icon、`tMax / tMin`、`precipMm > 0` 显示"中雨"）+ `summary` 段（可缺省）。
- 骨架态：现场块用 `Skeleton.Avatar` + 两行 `Skeleton`；7 日格子用 7 个相同大小的灰色方块占位。
- `summary` 独立判断：`data` 已到但 `summary` 未到时仍显示完整天气卡，`summary` 区域显示一行 loading。

#### 7.3.3 `AttractionList.tsx`

- props：`{ items?: Attraction[]; loading?: boolean; placeholderCount?: number }`（默认 5）
- 数据态：行布局——`imageUrl` 缩略（无则斜纹 placeholder）、名字 + category tag、description（可缺省）、右侧 ★ rating 和 `distanceKm`。
- 骨架态：渲染 `placeholderCount` 个行级骨架（缩略图 + 两行文本）。

#### 7.3.4 `RecommendationPanel.tsx`

- props：`{ data?: TripCard['recommendation']; chips?: string[]; loading?: boolean; onChipClick: (text: string) => void }`
- 数据态：黑色 pill tag + headline + body + 下方 chip 按钮行（4 枚）。
- 骨架态：pill + 两行 `Skeleton` + 4 个等宽 chip 占位按钮（`disabled`）。

#### 7.3.5 `TripCardView.tsx` — 组合器

- props：`{ weather?: WeatherSnapshot; attractions?: Attraction[]; card?: TripCard; onChipClick: (text: string) => void }`
- 渲染顺序：`DestinationHero → WeatherCard → AttractionList → RecommendationPanel`。
- 每个子卡片根据可用字段决定 `loading`：

  | 子卡片 | `loading` | 数据来源 |
  |---|---|---|
  | Hero | `!card` | `card?.hero` |
  | WeatherCard | `!weather && !card` | `data = card?.weather ?? weather`；`summary = card?.weather.summary` |
  | AttractionList | `!attractions && !card` | `items = card?.attractions ?? attractions` |
  | RecommendationPanel | `!card` | `data = card?.recommendation`；`chips = card?.chips` |

- 支持「只用其中一个卡片」的场景：直接 import 单个组件，不需要走 `TripCardView`。

### 7.4 三段式渐进渲染时序（骨架 → 裸数据 → 完整 narrative）

核心原则：**后端每个工具执行完毕立即下发原始结果，不等 `finalizeTripCard`**；前端每张卡片根据到达字段独立升级形态。`card` 事件仅作"narrative 补齐"层。

| 阶段 | 触发事件 | DestinationHero | WeatherCard | AttractionList | RecommendationPanel |
|---|---|---|---|---|---|
| **① 骨架** | 消息进入 `updating`（任一 `tool_start` 到达） | 骨架 | 骨架 | 骨架 | 骨架 |
| **② 裸数据（A）** | `tool_end:getWeather` | 骨架 | 填入温度 / 状况 / 湿度 / 风向 + 等级 / 能见度 / `qi` icon / 7 日格；`summary` 区保留单行 loading | 骨架 | 骨架 |
| **② 裸数据（B）** | `tool_end:getAttractions` | 骨架 | 同上 | 填入缩略图 / 名字 / category tag / ★ rating / `distanceKm`；每行 `description` 保留单行 loading | 骨架 |
| **③ 完整 narrative** | `card` 事件到达 | 渲染 breadcrumb + h1 城市名 + `tagline` + `verdictBadge` | `summary` 填入 | 每条 `description` 填入 | 渲染 `tag` pill + `headline` + `body` + 4 枚 chips |
| **④ 结束** | `final` + `done` | — | 停止 summary loading | 停止 description loading | — |

关键约束：

- **后端立即下发**：`apps/server/src/routes/chat.ts` 的 `on_tool_end:getWeather` / `on_tool_end:getAttractions` 收到就 `emitEvent('tool_end', …)`，**不 buffer、不等待后续工具**。
- **两个 `tool_end` 可能错序**：阶段 ② A 与 B 谁先到谁先升级对应卡片，不互相阻塞；若 getAttractions 先完成，AttractionList 先从骨架切到裸数据。
- **narrative 后到覆盖**：`card` 到达时以"补空"方式合入——`WeatherCard.summary / AttractionList[i].description / Hero.* / RecommendationPanel.*` 由 `card.*` 填充；**已渲染的裸数据字段保持不变**，避免闪烁（视觉上只是原本的 loading 区被文字替换）。
- **`card` 缺失兜底**：若 `finalizeTripCard` 执行失败或被客户端中止，阶段 ② 的裸数据形态保留；Hero / RecommendationPanel 维持骨架（或降级为"暂无总结"空态），WeatherCard / AttractionList 不回退骨架。前端在 `final` 或 `done` 到达且 `card` 仍为空时，停止 Hero / Recommendation 的骨架动画，切成静态空态。
- **整轮无任何工具结果**（例如闲聊"你好"）：不进入阶段 ①；继续走 `<MarkdownTyping>` fallback。

### 7.5 `ChatPage` 渲染卡片判断逻辑

`apps/web/src/chat/ChatPage.tsx`：

- `roles.assistant.contentRender` 改为闭包（在组件内部构造，持有 `messageById` 索引，按 message id 查出 `weather / attractions / card`）。
- 切换逻辑：

  | 消息状态 | 条件 | 渲染 |
  |---|---|---|
  | `loading` 且工具未开始 | `status === 'loading'` 且 `!weather && !attractions && !card` | 沿用现有 `正在思考中...`（Bubble 内部处理） |
  | 进入卡片流（阶段 ①） | `status === 'updating'` 且已收到过任一 `tool_start` | `<TripCardView>`，四张卡片全骨架 |
  | 裸数据 / narrative（阶段 ②–③） | `weather \|\| attractions \|\| card` | `<TripCardView>`，按 §7.4 逐张升级 |
  | 结束仍无结构化数据 | `status === 'success'` 且三者都为空 | `<MarkdownTyping content={content} />` |
  | error | `status === 'error'` | 沿用现有错误气泡 |

- `onChipClick = (text) => onRequest(text)`，与 `Sender` 的提交同路径。
- `MarkdownTyping` 保留，仅在无结构化数据时使用。

### 7.6 样式入口

- `apps/web/src/main.tsx` 增加 `import '../assets/weather-icons/qweather-icons.css'`（或放在 `index.css` 里）。

### 7.7 Frontend 改动清单

- `apps/web/src/main.tsx`（加载 `qweather-icons.css`）
- `apps/web/src/chat/useTravelAgent.ts`（扩 state + 事件处理）
- `apps/web/src/chat/ChatPage.tsx`（`contentRender` 切换 + chip 回调）
- `apps/web/src/chat/cards/DestinationHero.tsx`（**新建**）
- `apps/web/src/chat/cards/WeatherCard.tsx`（**新建**）
- `apps/web/src/chat/cards/AttractionList.tsx`（**新建**）
- `apps/web/src/chat/cards/RecommendationPanel.tsx`（**新建**）
- `apps/web/src/chat/cards/TripCardView.tsx`（**新建**）

---

## 8. 验证

1. `pnpm dev`，浏览器打开 web。
2. 输入「我想去西双版纳」，DevTools Network SSE 面板里应看到：
   - 进入 `updating`：页面已渲染 Hero / WeatherCard / AttractionList / RecommendationPanel 全部**骨架态**。
   - `tool_end:getWeather` → WeatherCard 从骨架切为实际内容（温度、湿度、风向 + 等级、能见度、当前 `qi` icon、7 日格 + `qi` icon），`summary` 区仍为 loading。
   - `tool_end:getAttractions` → AttractionList 从骨架切为实际景点行（缩略图、评分、距离、tags），`description` 仍为空。
   - `card` → Hero 骨架切为实际内容；WeatherCard 的 `summary` 填入；每个景点补 `description`；RecommendationPanel 骨架切为实际 `headline / body` + 4 个 chips。
   - `final` 空 `content` → `done`。
3. **独立组件验证**：在任意 demo 页面 / Storybook 单独渲染 `<WeatherCard loading />`、`<AttractionList loading />`、`<RecommendationPanel loading onChipClick={...} />`，能独立显示骨架。
4. 点任一 chip → 新 user 气泡为 chip 文案，重新触发完整流程。
5. 故意 unset `QWEATHER_API_KEY` → 走 `error` 事件，fallback 到 MarkdownTyping 显示错误。
6. 关闭页面中途 → server 日志「客户端连接已断开」，不应 emit `card`。
7. 字体加载：Network 面板确认 `qweather-icons.woff2` 成功加载；无 code 缺失时 fallback 到 `qi-999`。
8. `pnpm --filter @travel/web build` 通过 TS 校验。
