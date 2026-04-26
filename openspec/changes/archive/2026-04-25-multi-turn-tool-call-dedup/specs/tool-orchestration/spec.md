## ADDED Requirements

### Requirement: 历史 assistant 回合必须有可读摘要

frontend `useTravelAgent.toHistory` 在向 backend 发送 history 前，必须把已渲染过 TripCard 的 assistant 消息（content 为空 + 有 card / weather / attractions 数据）替换成 `[已为「<city>」生成完整行程卡（含天气、N 条景点、出行建议）。请勿为该地名重复调用工具。]` 形式的摘要文本。

#### Scenario: TripCard 已渲染的回合

- **WHEN** 历史中存在一条 assistant 消息，content 为空且 `card` 字段非空
- **THEN** `toHistory` 输出的 message.content 包含城市名称和数据规模的摘要

#### Scenario: 仅有裸数据但 card 缺失

- **WHEN** assistant 消息只有 weather/attractions 但无 card
- **THEN** 摘要为 `[已查询「<city>」的天气和景点。请勿重复调用相同工具。]`

### Requirement: backend 占位兜底

`historyToAgentMessages` 必须把空 content 的 assistant 历史消息**替换**为 `[此前一回合已生成行程卡或完成处理，请勿为该地名重复调用工具。]` 占位，**不再丢弃**整条消息。

#### Scenario: 旧客户端发空 assistant content

- **WHEN** history 中存在 `role==='assistant' && content.trim()===''`
- **THEN** 转发给 LangGraph agent 时，该消息的 content 被替换为占位摘要
- **AND** 消息不被过滤掉，保持对话回合数和先后关系

### Requirement: 单轮工具调用按工具名去重

server 在单次 chat 请求生命周期内，每个公开工具（getWeather / getAttractions）的 tool_start 与 tool_end 事件最多 emit 一次；finalizeTripCard 最多触发一张 `card` 事件。

#### Scenario: LLM 并行调多次同名工具

- **WHEN** LLM 在单轮内对 `getWeather` 发起两次调用（不同 run_id）
- **THEN** server 仅下发第一次的 `tool_start` 与对应 `tool_end`
- **AND** 第二次调用的 result 不污染 cachedWeather
- **AND** server 日志输出 `同名工具在单轮内被重复触发，已忽略多余调用`

#### Scenario: LLM 重复调 finalizeTripCard

- **WHEN** LLM 在单轮内调用 `finalizeTripCard` 两次
- **THEN** server 仅下发第一张 card
- **AND** server 日志输出 `finalizeTripCard 在单轮内被重复触发，已忽略多余 card`

### Requirement: prompt 强约束历史地名

system prompt 必须明确禁止 LLM 为历史回合的地名重复调用工具，并约束单轮最多一对工具调用。

#### Scenario: 当前 user 消息提到新地名

- **WHEN** history 中已有"已为「上海」生成行程卡"摘要，当前 user 消息为"我想去北京"
- **THEN** LLM 仅为"北京"调一次 getWeather + 一次 getAttractions，不为"上海"复查

#### Scenario: 当前 user 消息只是追问

- **WHEN** history 中已有"已为「上海」生成行程卡"摘要，当前 user 消息为"推荐三天两夜行程"
- **THEN** LLM 不调任何工具，直接以文本回答
