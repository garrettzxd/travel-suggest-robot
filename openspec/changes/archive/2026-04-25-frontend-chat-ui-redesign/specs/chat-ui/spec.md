## ADDED Requirements

### Requirement: 三段 sticky 布局

Web 端聊天页面必须由 TopBar（吸顶）、ScrollArea（可滚动消息区）、InputBar（吸底）三段组成，整页高度填满 viewport。

#### Scenario: 输入框始终可见

- **WHEN** 用户在长会话里上下滚动消息
- **THEN** TopBar 与 InputBar 始终固定在顶部和底部，消息区在两者之间滚动

### Requirement: 空会话欢迎卡

当 `messages.length === 0` 时，ScrollArea 顶部必须渲染 WelcomeCard，展示欢迎语 + 三列能力面板（景点推荐 / 天气查询 / 出行建议）+ 引导语。

#### Scenario: 首条用户消息发出后欢迎卡消失

- **WHEN** 用户发出第一条消息
- **THEN** WelcomeCard 自然消失，由消息流接管渲染

### Requirement: TripCardView 渐进渲染

assistant 消息收到任意 `tool_start` 后，必须渲染 TripCardView，按 Hero / Weather / Attractions / Recommendation 顺序串四张子卡。

#### Scenario: 工具结果到达逐张升级

- **WHEN** `tool_end:getAttractions` 到达
- **THEN** AttractionList 从骨架切到裸数据，每行 description 仍 loading

#### Scenario: card 到达补齐 narrative

- **WHEN** `card` 事件到达
- **THEN** Hero / Recommendation 从骨架切到完整 narrative，AttractionList 的 description 与 WeatherCard 的 summary 同步填入

### Requirement: 闲聊场景回退 Markdown

assistant 消息整轮没有任何 `tool_start` 也没有任何结构化字段时，必须回退到 MarkdownTyping 气泡渲染 LLM 文本。

#### Scenario: "你好" 类闲聊

- **WHEN** 用户发送"你好"且 LLM 不调任何工具
- **THEN** assistant 消息以 Markdown 打字机效果展示固定欢迎语

### Requirement: CardContainer 唯一外壳

所有卡片必须基于 `apps/web/src/chat/cards/CardContainer.tsx` 渲染统一的边框、圆角、阴影与基础内边距，业务组件不得重复定义这层外观。

#### Scenario: WelcomeCard 内部能力面板复用

- **WHEN** 渲染 WelcomeCard 的三块能力面板
- **THEN** 它们也使用 CardContainer，仅通过 `backgroundColor` 区分粉 / 浅蓝 / 沙色底
