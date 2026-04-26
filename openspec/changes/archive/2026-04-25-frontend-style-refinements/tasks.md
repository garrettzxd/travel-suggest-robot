## 1. Shared / Protocol

- [x] 1.1 不涉及共享类型变化；`recommendation.tag` 保持 string，约束改在 prompt 层。

## 2. Server

- [x] 2.1 在 `apps/server/src/agent/prompts.ts` 第 2 条加入"打招呼模板"，要求纯问候逐字照抄。
- [x] 2.2 在第 3 步约束里追加：`recommendation.tag` 文案必须与 `verdictBadge` 语义对齐（good→"推荐 · 近期出发"、caution→"谨慎 · 建议调整"、avoid→"不建议 · 近期出发"）。

## 3. Web

- [x] 3.1 重构 `apps/web/src/theme/tokens.ts`：删除 `attractionTagColor`；新增 `attractionTag`、`VerdictCode`、`verdictColor`、`verdictBadgeLabel`。
- [x] 3.2 `apps/web/src/chat/cards/AttractionList.tsx` 改用 `attractionTag` 单一配色。
- [x] 3.3 `apps/web/src/chat/cards/DestinationHero.tsx` 删除本地 `VERDICT_STYLE`，改用共享的 `verdictColor` + `verdictBadgeLabel`。
- [x] 3.4 `apps/web/src/chat/cards/RecommendationPanel.tsx`：pill + headline 改成同一行；移除 chips 渲染；新增 `verdict?: string` prop 并把 `PillTag` 颜色按 verdict 驱动。
- [x] 3.5 `apps/web/src/chat/cards/TripCardView.tsx`：新增 `ChipsBar`，挂在 RecommendationPanel 下方；从 `card?.hero.verdictBadge` 透传 `verdict` 给 RecommendationPanel。

## 4. Validation

- [x] 4.1 `pnpm --filter @travel/web typecheck` 通过。
- [x] 4.2 `pnpm --filter @travel/server typecheck` 通过。
- [x] 4.3 手工验证：景点 tag 全部统一颜色；recommendation pill 紧贴 headline 不撑满；chips 在卡片下方独立成行；good/caution/avoid 三档 verdict pill 与 hero badge 颜色同步切换。

## 5. Documentation

- [x] 5.1 不影响 `plans/Web 端聊天界面视觉改版 PRD.md`。
- [x] 5.2 不涉及 `questions/`。
- [x] 5.3 此 change 的 proposal/design/tasks/spec 一致。
