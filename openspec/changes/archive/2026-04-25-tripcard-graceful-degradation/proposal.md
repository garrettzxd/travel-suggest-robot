## Why

- 当前问题或机会：
  - getWeather 工具失败时（鉴权 / 网络 / 超时），LLM 仍会调 `finalizeTripCard`，但 backend `chat.ts` 的旧 gate 要求 `cachedWeather` 与 `cachedAttractions` **都**存在才下发 `card`。结果整张行程卡都不出来，地点 / 景点 / 总结全卡在骨架。
  - 即便不失败，DestinationHero 一直显示斜纹 PLACEHOLDER 占位图——视觉很 mock，不像产品。
  - 前端没有"已结束但 card 仍空"的兜底视觉，骨架会一直转下去。
- 为什么现在要做：
  - 用户实测 weather 失败时整页卡死在骨架，体验差。
  - 设计稿要求 Hero 区是真实城市图片。
- 如果不做会怎样：
  - 任何 QWeather 故障都会让整个旅游卡片瘫痪；地点 Hero 永远是斜纹占位，没有产品感。

## What Changes

- `packages/shared/src/travel.ts`：
  - `TripCard.weather` 改为 optional。
  - 新增 `TripCard.hero.heroImageUrl?: string`。
- `apps/server/src/agent/tools/finalizeTripCard.ts`：
  - Zod schema 中 `weather` 改 optional + 描述里说明"getWeather 失败时省略，不要凭空编造"。
- `apps/server/src/agent/prompts.ts`：
  - 新增"工具失败兜底"分支约束：getWeather 失败时调 `finalizeTripCard` 必须省略 weather 字段，且 `recommendation.body` 不要谈天气。
- `apps/server/src/routes/chat.ts`：
  - 放宽 gate：只要 `cachedAttractions` 在就下发 card；weather 缺失走降级模式。
  - `buildTripCard`：weather 缺失时整段省略 `card.weather`；`hero.heroImageUrl` 从 `mergedAttractions.find(a => a.imageUrl)?.imageUrl` 派生，零额外 API 调用。
- `apps/web/src/chat/cards/DestinationHero.tsx`：有 `heroImageUrl` 时渲染真实图 + 暗色渐变 + 左下小标；无图时退到斜纹 PLACEHOLDER。
- `apps/web/src/chat/cards/{DestinationHero,WeatherCard,AttractionList,RecommendationPanel}.tsx`：新增 `settled?: boolean` prop；settled+无数据时切静态空态（"未生成地点总结" / "天气暂不可用 🌥️" / "未生成出行建议" 等）。
- `apps/web/src/chat/cards/TripCardView.tsx`：透传 `settled`；安全访问 `card?.weather?.summary`。
- `apps/web/src/chat/ChatPage.tsx`：把 `settled = (status === 'success')` 透传给 TripCardView。

## Capabilities

### New Capabilities

- `trip-card`: 沉淀 TripCard 数据合并、降级、Hero 图派生与前端骨架→空态兜底的完整能力。

### Modified Capabilities

- 无（TripCard 之前未独立沉淀）。

### Removed Capabilities

- 无。

## Impact

- Affected workspaces:
  - `packages/shared`: `travel.ts` 类型定义。
  - `apps/server`: `routes/chat.ts`、`agent/tools/finalizeTripCard.ts`、`agent/prompts.ts`。
  - `apps/web`: `chat/cards/*` 五处。
- Affected APIs / protocols:
  - `card` SSE 事件 payload：`weather` 现在可缺失；`hero` 新增可选 `heroImageUrl`。
- Compatibility impact:
  - 完全向后兼容；老客户端读 `card.weather` 加可选链即可。
- Risks:
  - LLM 不严格遵守"weather 失败时省略"prompt → 仍传一个空对象。Zod optional 允许传 `undefined` 但若传空对象 `summary` 会缺，前端兜底为 undefined 仍然没事。
  - 第一张景点照片质量参差，作为 Hero 可能不"全景"。
- Rollback:
  - 单独回退此 change，恢复"weather 必须存在才能下发 card"的旧行为；Hero 退到斜纹占位。
- Docs to update:
  - 无（PRD §7.4 的兜底要求本次正式落地）。
