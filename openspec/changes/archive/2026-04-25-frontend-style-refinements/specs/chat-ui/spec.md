## MODIFIED Requirements

### Requirement: 景点列表 tag 统一配色

景点列表中所有分类 tag 必须使用唯一一套淡紫配色（背景 `#BEADE0`、文字 `#3D2A6B`），不得按 category 分色。高德返回非预期分类（"购物服务" / "餐饮" 等）时也应使用同一套配色，不得退化到灰色。

#### Scenario: 高德返回非主流分类

- **WHEN** `Attraction.category` 为 "购物服务"
- **THEN** tag 仍渲染 `#BEADE0` 底 + `#3D2A6B` 文字，与"风景名胜"、"公园"等分类视觉完全一致

### Requirement: verdict 颜色三档区分

DestinationHero 右上角 badge 与 RecommendationPanel 顶部 pill 必须共用同一份 verdict 色板，按 `card.hero.verdictBadge` 三档颜色严格同步：good=绿、caution=琥珀、avoid=红。

#### Scenario: verdictBadge=avoid

- **WHEN** `card.hero.verdictBadge === 'avoid'`
- **THEN** Hero 右上角渲染红底 "不建议出行" badge
- **AND** RecommendationPanel pill 渲染同色调红底胶囊（文案由 LLM 提供，prompt 已要求语义一致）

#### Scenario: verdictBadge 缺失或非法

- **WHEN** `card.hero.verdictBadge` 不在 good/caution/avoid 范围
- **THEN** Hero badge 不渲染；RecommendationPanel pill 退到默认绿底品牌色

### Requirement: 总结卡 pill 不占整行

RecommendationPanel 顶部 pill 必须与 headline 同一行内联展示，pill 宽度自适应文本，不得撑满卡片宽度。

#### Scenario: 长 headline

- **WHEN** headline 文本较长导致整行无法容纳 pill + headline
- **THEN** 容器内允许 wrap，但 pill 仍保持紧凑胶囊形态，不得 stretch 到整行

### Requirement: chips 独立挂在卡片外

`card.chips` 必须由 TripCardView 内的 `ChipsBar` 在 RecommendationPanel 下方独立渲染，**不得**置于任何 CardContainer 内。

#### Scenario: 4 枚 chip 渲染

- **WHEN** `card.chips` 长度为 4
- **THEN** ChipsBar 在 RecommendationPanel 下方渲染 4 个裸按钮，无白底卡壳；点击任一 chip 触发 `onChipClick(text)` 等价于用户重新发送该文案

### Requirement: 打招呼回复一致性

当用户消息只是问候（"你好"/"hi"/"hello"/"在吗"/"hey" 等纯问候，不含地名或具体诉求）时，LLM 必须逐字使用 prompt 中规定的固定文案回复，不得改写、重排或额外添加内容，且不得调用任何工具。

#### Scenario: 多次发送"你好"

- **WHEN** 用户在不同会话或同一会话中多次发送"你好"
- **THEN** LLM 每次返回的回复文本完全一致
