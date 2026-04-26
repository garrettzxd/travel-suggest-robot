## Why

- 当前问题或机会：
  - 上一版前端实现按 PRD 上线后，视觉与设计稿仍有 4 处偏差。
  - LLM 对"你好"等纯问候每次返回的文案不一致，影响第一次接触印象。
- 为什么现在要做：
  - 设计师 review 后明确指出：景点 tag 颜色不统一、总结卡 pill 100% 宽度、chips 应该挂在卡片下方、verdict 三档颜色没区分。
- 如果不做会怎样：
  - 视觉一致性差；用户多次发"你好"会看到不同回复，体验感像没有产品化。

## What Changes

- `apps/web/src/theme/tokens.ts`：
  - 删除按 category 分色的 `attractionTagColor` 映射；新增统一 `attractionTag = { bg:'#BEADE0', fg:'#3D2A6B' }`。
  - 新增 `VerdictCode` / `verdictColor` / `verdictBadgeLabel` 三件套，让 DestinationHero 与 RecommendationPanel 共用同一份 verdict 色板。
- `apps/web/src/chat/cards/AttractionList.tsx`：所有分类 tag 直接用 `attractionTag`。
- `apps/web/src/chat/cards/RecommendationPanel.tsx`：
  - pill + headline 改为同一行 flex；pill 不再撑满整行。
  - 移除内部 chips 渲染（迁出到 TripCardView）。
  - PillTag 颜色按 verdict 驱动；文案仍用 LLM 提供的 `data.tag`。
- `apps/web/src/chat/cards/TripCardView.tsx`：新增 `ChipsBar` 组件，挂在 RecommendationPanel 下方，无 CardContainer 包裹；透传 `verdict` 给 RecommendationPanel。
- `apps/web/src/chat/cards/DestinationHero.tsx`：复用共享 `verdictColor` / `verdictBadgeLabel`，删除本地 `VERDICT_STYLE`。
- `apps/server/src/agent/prompts.ts`：
  - 新增"打招呼模板"：纯问候必须逐字照抄固定文案。
  - 在 `recommendation.tag` 描述里加一条 verdict→文案映射约束。

## Capabilities

### New Capabilities

- 无（在既有 chat-ui 上做样式与协议细化）。

### Modified Capabilities

- `chat-ui`: 修订景点 tag 颜色、verdict 区分、chips 位置、greeting 一致性 4 项 requirement。

### Removed Capabilities

- 无。

## Impact

- Affected workspaces:
  - `apps/web`: tokens + AttractionList + RecommendationPanel + TripCardView + DestinationHero。
  - `apps/server`: 仅 `prompts.ts`。
  - `packages/shared`: 不变。
- Affected APIs / protocols:
  - 无；`recommendation.tag` 仍是字符串，但内容受 prompt 约束更紧。
- Compatibility impact:
  - 完全向后兼容。旧客户端如果还在依赖 `attractionTagColor` 导出会构建失败——但仓库内只有一处使用，已同步更新。
- Risks:
  - LLM 不严格遵守 verdict→文案映射时，pill 颜色与文字可能仍不一致——已在 prompt 写明并给固定对照表，可控。
- Rollback:
  - 单独回退此 change 即可恢复多色 tag 与 chips-in-card 形态。
- Docs to update:
  - `plans/Web 端聊天界面视觉改版 PRD.md`：仍以 PRD §5.6 为准，本 change 是对实现细节的修订，不需要改 PRD。
