## ADDED Requirements

### Requirement: weather 失败仍下发 card

当 `getWeather` 工具失败、`getAttractions` 工具成功且 LLM 调用了 `finalizeTripCard` 时，server 必须仍然下发 `card` SSE 事件，但 `card.weather` 字段整段省略。

#### Scenario: QWeather 鉴权失败

- **WHEN** `getWeather` 抛错（例如 401 鉴权失败）
- **AND** `getAttractions` 成功返回景点列表
- **AND** LLM 调用 `finalizeTripCard` 时省略了 weather 字段
- **THEN** server 仍构造 `TripCard` 并 emit `card` 事件
- **AND** `card.weather` 字段不存在
- **AND** `card.hero` / `card.attractions` / `card.recommendation` / `card.chips` 全部正常填充

### Requirement: attractions 缺失阻断 card 下发

当 `getAttractions` 工具失败导致 `cachedAttractions` 缺失时，server **不得**下发 `card` 事件，并写 warn 日志说明原因。

#### Scenario: 仅景点工具失败

- **WHEN** `getAttractions` 抛错且 `cachedAttractions` 为 undefined
- **THEN** 即使 `finalizeTripCard` 被调用，server 也不 emit `card`
- **AND** server 日志输出 `缺少 attractions 裸数据，无法合并 TripCard`

### Requirement: Hero 图从景点 photo 派生

`buildTripCard` 必须从 `attractions` 列表里取第一张 `imageUrl` 非空的景点照片填到 `hero.heroImageUrl`；所有景点都没有 imageUrl 时该字段省略。

#### Scenario: 所有景点都有图

- **WHEN** `attractions[0].imageUrl` 存在
- **THEN** `card.hero.heroImageUrl === attractions[0].imageUrl`

#### Scenario: 仅部分景点有图

- **WHEN** `attractions[0].imageUrl` 缺失但 `attractions[3].imageUrl` 存在
- **THEN** `card.hero.heroImageUrl === attractions[3].imageUrl`

#### Scenario: 全部景点无图

- **WHEN** `attractions.every(a => !a.imageUrl)`
- **THEN** `card.hero.heroImageUrl` 字段省略；前端 DestinationHero 退到斜纹 PLACEHOLDER

### Requirement: 前端 settled 静态空态

当 assistant 消息 `status === 'success'` 但 `card` 仍未到达时，TripCardView 内部的 DestinationHero / WeatherCard / AttractionList / RecommendationPanel 必须切到静态空态，不得继续渲染骨架动画。

#### Scenario: card 缺失

- **WHEN** 消息进入 success 状态但 `card` 字段为 undefined
- **THEN** Hero 显示"未生成地点总结"
- **AND** Recommendation 显示"未生成出行建议"
- **AND** 已经拿到的 weather / attractions 裸数据保持不变（不回退到骨架）

#### Scenario: weather 缺失但 card 已到

- **WHEN** `card.weather` 整段缺失（getWeather 失败的兜底路径）
- **THEN** WeatherCard 显示"天气暂不可用 🌥️"静态空态，不再骨架
