## Context

- 现状：
  - 上一版 `apps/web/src/theme/tokens.ts` 用 `attractionTagColor` 把每个景点分类映射到不同 tag 配色；高德返回非预期分类（譬如"购物服务"）时落到灰色。
  - `apps/web/src/chat/cards/RecommendationPanel.tsx` 把 PillTag、headline、body、chips 都塞在一个 `flex-direction: column` 里，pill 因 `align-items: stretch` 默认值而占满整行；chips 也在同一卡内。
  - `apps/web/src/chat/cards/DestinationHero.tsx` 内部维护一份 `VERDICT_STYLE`，与 RecommendationPanel pill 没有共享色板。
  - `apps/server/src/agent/prompts.ts` 没有"打招呼"模板；模型对"你好"的回复每次格式不同。
- 本次变更入口：
  - 设计师 review 反馈 4 处偏差；用户额外要求 verdict 完整区分。
- 现有限制：
  - 不改变 SSE 事件协议；不改变 TripCard 类型结构。

## Goals / Non-Goals

**Goals:**

- 景点 tag 视觉统一为单一淡紫配色 `#BEADE0` / `#3D2A6B`。
- DestinationHero 右上角 badge 与 RecommendationPanel pill 颜色与 verdictBadge 严格同步（good/caution/avoid 三档）。
- chips 移到 RecommendationPanel 之外、卡组下方，呈"裸按钮组"形态。
- 打招呼回复在多次会话间完全一致。

**Non-Goals:**

- 不引入 verdict 枚举到 `recommendation` 字段（pill 文案仍由 LLM 生成）。
- 不为不同分类挑配色（彻底放弃 category→color 映射）。
- 不引入 prompt 多语言。

## Affected Layers

- `packages/shared`:
  - 无。
- `apps/server`:
  - 修改 `apps/server/src/agent/prompts.ts`：新增打招呼模板 + 加 recommendation.tag 与 verdictBadge 文案对照约束。
- `apps/web`:
  - 修改 `apps/web/src/theme/tokens.ts`、`apps/web/src/chat/cards/{AttractionList,RecommendationPanel,TripCardView,DestinationHero}.tsx`。

## Decisions

### 1. verdict 颜色与文案解耦

- Decision:
  - `verdictColor` 只存颜色，`verdictBadgeLabel` 只存 hero badge 文案，`recommendation.tag` 文案仍由 LLM 自由生成。
- Rationale:
  - 颜色由产品锁死，文案保留 LLM 灵活性。未来要换"推荐 · 近期出发"成"现在出发刚刚好"只动 prompt，不动前端。
- Rejected alternatives:
  - 把 verdict 枚举写进 `recommendation`：耦合太紧，前端要做完整文案映射，prompt 修改需要前端同步更新。

### 2. ChipsBar 与 RecommendationPanel 解耦

- Decision:
  - chips 从 RecommendationPanel 抽出，由 TripCardView 内的 ChipsBar 渲染，无 CardContainer 包裹。
- Rationale:
  - 设计稿明确 chips 应"挂在卡片外"作为后续追问入口，不该被卡片边框框住。
- Rejected alternatives:
  - 在 RecommendationPanel 内做"卡片底部分隔条"模拟外挂：视觉上仍像在卡内，与设计稿差距大。

### 3. 打招呼模板硬编码

- Decision:
  - 在 prompt 里写一段固定文案，要求模型纯问候时逐字照抄。
- Rationale:
  - LLM 自由生成的问候文本每次都不一样，影响第一次接触印象。
- Rejected alternatives:
  - 在前端拦截"你好"等关键字直接返回固定文案：会绕过 backend / SSE 链路，与现有架构不一致；且容易漏关键字。

### Data Flow / Responsibility

- 请求入口：不变。
- 数据返回：
  - `card.hero.verdictBadge` 直接驱动 RecommendationPanel pill 颜色；`recommendation.tag` 仅作为文本渲染。
  - chips 仍来自 `card.chips`，由 TripCardView 透传给 ChipsBar 而非 RecommendationPanel。
- 职责边界：
  - prompt 决定文案、颜色由前端 token 决定。

### Compatibility / Migration

- 是否有字段兼容问题：无。
- 是否需要迁移旧数据：无；TripCard 结构未变。
- 是否需要重启 dev server：是，prompt 修改要 server 端 `tsc -b -w` 重编。

## Validation Plan

- 类型检查：`pnpm -r typecheck`（已通过）。
- 构建验证：本 change 不改构建链路。
- 手工验证：
  - 输入"我想去成都"：所有景点 tag 颜色完全一致；recommendation pill 紧贴 headline 不撑满；chips 在卡片下方独立成行。
  - 模拟 caution / avoid 三档 verdict：pill 与 hero badge 颜色同步切换。
  - 输入"你好"五次：每次返回完全相同的固定文案。

## Risks / Trade-offs

- 风险 1：LLM 在 caution/avoid 场景仍写"推荐 · 近期出发"导致颜色与文字矛盾。
  - 缓解：prompt 已加固定对照表，且 PillTag 颜色严格按 verdictBadge——颜色优先于文字，至少不会出现"绿底 + 不建议"。
- 风险 2：移除 attractionTagColor 后未来如果需要按分类区分，需要重新引入。
  - 缓解：tokens.ts 仍保留 `tagPalette`（粉/浅蓝/沙）供 WelcomeCard 使用，未来加新映射成本低。

## Documentation Sync

- 需要同步的 `plans/` 文档：无（PRD 仍以原样为准，本 change 是对实现细节的修订）。
- 需要同步的 `questions/` 文档：无。
