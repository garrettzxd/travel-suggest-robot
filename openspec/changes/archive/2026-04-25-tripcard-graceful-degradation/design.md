## Context

- 现状：
  - `TripCard.weather` 是必填，`finalizeTripCard` Zod schema 也强制要求 weather.summary。
  - chat.ts 在 `on_tool_end:finalizeTripCard` 分支里要 `cachedWeather && cachedAttractions` 才下发 `card`；缺一不发。
  - DestinationHero 永远渲染斜纹 `placeholder-stripe` 占位图。
  - 前端 settled 概念尚未引入，`status === 'success'` 后骨架仍可能转。
- 本次变更入口：
  - 用户上报"weather 失败时整页卡死在骨架"；同时设计稿明确 Hero 区要真图。
- 现有限制：
  - 不引入新的 Amap 调用——Hero 图必须从已有 attractions photo 派生。
  - 不改 SSE 事件类型，只调整 payload 形态。

## Goals / Non-Goals

**Goals:**

- weather 失败时整张 TripCard 仍能下发，hero / attractions / recommendation 正常渲染。
- DestinationHero 在有可用 attractions photo 时显示真实图片。
- 前端在 final/done 到达后 stop spinning：所有缺数据子卡切静态空态。

**Non-Goals:**

- 不为 hero 图单独发请求（接受"用第一张可用景点照片"的妥协）。
- 不在 attractions 失败时尝试只发 weather——attractions 是行程卡的最小必要数据，缺了直接不发 card。

## Affected Layers

- `packages/shared`:
  - `travel.ts`：`TripCard.weather` → optional；`TripCard.hero.heroImageUrl?: string`。
- `apps/server`:
  - `agent/tools/finalizeTripCard.ts`：weather Zod schema → optional。
  - `agent/prompts.ts`：新增"工具失败兜底"段落。
  - `routes/chat.ts`：放宽 gate；`buildTripCard` 处理 weather 缺失 + 派生 heroImageUrl。
- `apps/web`:
  - `chat/cards/{DestinationHero,WeatherCard,AttractionList,RecommendationPanel,TripCardView}.tsx`：新增 settled prop + 静态空态。
  - `chat/ChatPage.tsx`：`settled = (status === 'success')` 透传。

## Decisions

### 1. weather 缺失策略：整段省略而非空对象

- Decision:
  - `card.weather` 要么是完整 `WeatherSnapshot & { summary }`，要么字段不存在；不下发 `weather: {}` 这种半成品。
- Rationale:
  - 前端用可选链 `card?.weather?.summary` 即可，不需要逐字段判断。
- Rejected alternatives:
  - 默认填 placeholder 数据：会误导用户，违反"不编造数据"原则。

### 2. Hero 图派生策略：复用景点 photo

- Decision:
  - `buildTripCard` 从 `mergedAttractions.find(a => a.imageUrl)?.imageUrl` 取第一张可用 photo 作为 `hero.heroImageUrl`。
- Rationale:
  - 零额外 API 调用；第一张景点通常是评分最高、最有代表性的。
- Rejected alternatives:
  - 单独调一次 `keywords="{city}全景"` 的 Amap 搜索：多一次 API 请求，且关键字 hit miss 不可控。
  - 走第三方 Unsplash API：跨域、速率、版权都要处理，远超本次范围。

### 3. Frontend settled 三段式

- Decision:
  - 子卡都接受 `settled?: boolean` prop；当 `loading && settled` 时渲染静态空态而非骨架。`settled` 由 `ChatPage` 派生自 `message.status === 'success'`。
- Rationale:
  - PRD §7.4 明确要求"final/done 到达且 card 仍空时，停止 hero/recommendation 骨架动画切静态空态"。
- Rejected alternatives:
  - 各子卡内部维护超时 timer：行为不一致，难维护。

### Data Flow / Responsibility

- 请求入口：
  - `agent` → `getWeather`（可能失败）+ `getAttractions` → `finalizeTripCard` → chat.ts 合并 → SSE `card` 事件。
- 数据返回：
  - chat.ts 收到 `tool_end:getWeather` 或 `tool_end:getAttractions` 时缓存裸结果；`tool_end:finalizeTripCard` 时调 `buildTripCard` 合并。
  - `buildTripCard` 检查 weather/attractions 是否齐：attractions 缺则不发 card；weather 缺则发 card 但省 weather。
- 职责边界：
  - `shared` 定义类型；
  - `server` 负责合并与降级；
  - `web` 负责骨架 → 裸数据 → narrative → 空态四个状态机。

### Compatibility / Migration

- 是否有字段兼容问题：`TripCard.weather` 由必填改 optional。前端访问处全部加可选链；老客户端如果仍按必填类型用，TS 会报错但运行时安全。
- 是否需要迁移旧数据：无；TripCard 不持久化。
- 是否需要重启 dev server：是（shared 类型变更需要重新构建 shared）。

## Validation Plan

- 类型检查：`pnpm -r typecheck` 通过。
- 构建验证：`pnpm --filter @travel/shared build` 重建 dist。
- 手工验证：
  - 临时把 `QWEATHER_KEY_ID` 改错触发 weather 失败；前端应看到地点 / 景点 / 总结都正常出，WeatherCard 显示"天气暂不可用 🌥️"。
  - 正常路径："我想去成都"，DestinationHero 顶部显示真实景点照片 + 底部黑色渐变 + 左下角 `成都 · HERO` 小标。

## Risks / Trade-offs

- 风险 1：LLM 在 weather 失败时仍传 `weather.summary` 编造内容。
  - 缓解：prompt 已显式禁止；Zod schema 允许省略；`buildTripCard` 即便 LLM 传了 weather narrative，也只在 `cachedWeather` 存在时才落到 `card.weather`。
- 风险 2：第一张景点照片不够"全景"（譬如是建筑特写）。
  - 缓解：可接受；后续如需独立 hero 搜索可作为下一个 change。

## Documentation Sync

- 需要同步的 `plans/` 文档：无。
- 需要同步的 `questions/` 文档：无。
