## 1. Shared / Protocol

- [x] 1.1 `packages/shared/src/travel.ts`：`TripCard.weather` 改 optional，加 JSDoc 说明"getWeather 失败时整段省略"。
- [x] 1.2 `packages/shared/src/travel.ts`：`TripCard.hero.heroImageUrl?: string` 新增可选字段。
- [x] 1.3 重新构建 `packages/shared`，`pnpm --filter @travel/shared build` 生成 dist。

## 2. Server

- [x] 2.1 `apps/server/src/agent/tools/finalizeTripCard.ts`：weather Zod schema 改 optional，描述强调"getWeather 失败时省略，不要凭空编造"。
- [x] 2.2 `apps/server/src/agent/prompts.ts`：在第 3 步加"工具失败兜底"约束，明确 getWeather 失败时省 weather + body 不谈天气；getAttractions 失败时不调 finalizeTripCard。
- [x] 2.3 `apps/server/src/routes/chat.ts`：放宽 finalizeTripCard 分支 gate，仅要求 `cachedAttractions`。
- [x] 2.4 `apps/server/src/routes/chat.ts` `buildTripCard`：weather 缺失时整段省略 `card.weather`；新增 `heroImageUrl` 派生（first attraction with imageUrl）。
- [x] 2.5 `apps/server/src/routes/chat.ts` `isFinalizeInput`：不再要求 weather 字段存在。

## 3. Web

- [x] 3.1 `apps/web/src/chat/cards/TripCardView.tsx`：修 `card?.weather.summary` 为安全 `card?.weather?.summary`；新增 `settled` 透传。
- [x] 3.2 `apps/web/src/chat/cards/DestinationHero.tsx`：有 `heroImageUrl` 时渲染真图 + 暗色渐变 + 左下小标；无图退到斜纹 PLACEHOLDER；新增 settled 静态空态（"未生成地点总结"）。
- [x] 3.3 `apps/web/src/chat/cards/WeatherCard.tsx`：新增 `WeatherUnavailable` 静态空态（"天气暂不可用 🌥️"），settled+无数据时切。
- [x] 3.4 `apps/web/src/chat/cards/AttractionList.tsx`：新增 settled 静态空态（"景点接口暂未返回数据"）。
- [x] 3.5 `apps/web/src/chat/cards/RecommendationPanel.tsx`：新增 settled 静态空态（"未生成出行建议"）。
- [x] 3.6 `apps/web/src/chat/ChatPage.tsx`：把 `settled = (status === 'success')` 透传给 TripCardView。

## 4. Validation

- [x] 4.1 `pnpm -r typecheck` 通过。
- [x] 4.2 手工验证 weather 失败场景：地点 / 景点 / 总结正常出，WeatherCard 切空态。
- [x] 4.3 手工验证正常场景：DestinationHero 渲染真实景点照片作为 Hero。

## 5. Documentation

- [x] 5.1 不影响 `plans/`。
- [x] 5.2 不涉及 `questions/`。
- [x] 5.3 此 change 的 proposal/design/tasks/spec 一致。
