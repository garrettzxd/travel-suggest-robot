# 多轮对话时 LLM 为历史地名重复调用工具，导致行程卡数据错乱

## 问题表现

- 复现路径：第一次对话「我想去上海」，正常返回上海的行程卡（地点 / 天气 / 景点 / 出行建议四张子卡都正确）。**第二次**接着发「我想去北京」。
- 第二次对话的 EventStream 面板里出现 4 个 `tool_start` 事件、4 个 `tool_end` 事件、**2 个 `card` 事件**：
  ```
  tool_start  getWeather      {"location":"上海"}
  tool_start  getAttractions  {"location":"上海"}
  tool_start  getWeather      {"location":"北京"}
  tool_start  getAttractions  {"location":"北京"}
  tool_end    getAttractions  [天安门广场...]        ← 北京的
  tool_end    getAttractions  [外滩...]              ← 上海的
  tool_end    getWeather      {location:"上海"...}
  tool_end    getWeather      {location:"北京"...}
  card        {hero:{city:"北京",tagline:"黄浦江畔..."}}  ← 标题北京、tagline 是上海
  card        {hero:{city:"北京",tagline:"红墙金瓦..."}}  ← 完全是北京
  final       {"content":""}
  done
  ```
- 渲染结果错乱：地点卡显示「北京」，天气卡显示北京数据，但**景点列表展示的是上海的外滩、豫园、人民广场**等。tagline 也可能混入"黄浦江畔"等上海描述。

## 本次最终定位

**根因不在 backend 工具本身，也不在前端 reducer**——backend 是忠实地把 LLM 实际发出的 4 个 tool_call 全转发了，前端也按"后到覆盖先到"的合理策略合并状态。**真正的问题在 history 拼装与 prompt 引导**：

1. **空 assistant 历史被静默丢弃**。前端 `toHistory` 把 `messages` 原样转给 backend；按 `prompts.ts` 的强约束，LLM 调完 `finalizeTripCard` 之后会**以空字符串结束本轮回复**——所以历史里 assistant 消息的 `content === ""`。
2. **backend `historyToAgentMessages` 又把空 content 的消息过滤掉**：原来的 filter 是 `item.content.trim() !== ""`。空 assistant 消息整条丢弃，是为了避免给 Moonshot 发空 message 触发 "unknown content type:"。
3. **结果 LLM 看到的 history 是两条连续 user 消息**：
   ```
   user: 我想去上海
   user: 我想去北京
   ```
4. 模型在没有任何 assistant 回合分隔的情况下，把两条连续 user 消息当成"用户想规划上海和北京两趟"——按 prompt 的并行调用规则，对两个城市分别并行发起 `getWeather` + `getAttractions`，再调用两次 `finalizeTripCard`。
5. 即便没有 #4 这种显著并发，**单纯的"空 assistant 回合"本身也会让模型误判上一轮没收口**，倾向于"补做一遍"上一个城市的查询。

## 问题原因

可以分成三个独立但相互放大的成因：

### 1. History 没有传达"上一回合已完成"

PRD 规定 LLM 调完 `finalizeTripCard` 后空字符串收尾、由前端 TripCard 渲染。这种设计的代价是：assistant 消息的可读 content 是空的，**完成态信息只存在前端的 `card` 字段里**，没有透传回 LLM。

### 2. Backend 用"丢弃空消息"对抗 Moonshot 的 schema 限制

为了规避 Moonshot 的 `unknown content type:` 报错，backend `historyToAgentMessages` 简单粗暴地把空 content 的历史消息整条过滤——这是**问题的关键放大器**。过滤掉以后，多轮 user 消息看上去像挤在一起，模型很难分清"哪个是已经处理过的、哪个是新需求"。

### 3. Prompt 没有显式禁止"为历史地名复查"

原版 prompt 第 3-4 条强约束了"提到地名 → 并行调工具"和"调用顺序"，但**没有任何一条限制工具调用的范围只能是"当前 user 消息里的地名"**。当 history 看上去模棱两可时，模型按字面理解把所有 user 消息里的地名都查一遍，并不违背 prompt。

### 4. （次要）Backend 没有同名工具去重

即便 LLM 抽风并行调多次同名工具，server 也照单全收，把 4 个 `tool_start` / `tool_end` 全转发，并把第二次的工具结果覆盖第一次的 cache。`buildTripCard` 用 cache 里"最后一次"的 attractions 拼卡，结果"地点 = LLM 最后一次 finalize 的 city" 但 "attractions = cache 里最后一次 tool_end 的城市"——两端不一定来自同一城市，于是出现"地点北京 + 景点上海"。

## 修复方案

三层兜底，缺一层都不够稳：

### 1. 前端：合成"已完成"摘要替代空 content

`apps/web/src/chat/useTravelAgent.ts` 新增 `summarizeAssistantTurn`，在 `toHistory` 里调用：

- assistant 消息有非空 content → 原样保留；
- assistant 消息空 content + 有 `card` → 替换成 `[已为「{city}」生成完整行程卡（含天气、N 条景点、出行建议）。请勿为该地名重复调用工具。]`；
- 只拿到 weather / attractions、没拿到 card（finalize 失败）→ 替换成 `[已查询「{city}」的天气和景点。请勿重复调用相同工具。]`；
- 都没有 → 保持空（让 backend 兜底）。

这样下游 LLM 看到的 history 是：

```
user: 我想去上海
assistant: [已为「上海」生成完整行程卡（含天气、8 条景点、出行建议）。请勿为该地名重复调用工具。]
user: 我想去北京
```

「上海已收口」的事实显式写出来，模型不再会把它和当前需求混淆。

### 2. 后端：放开过滤 + 占位兜底

`apps/server/src/routes/chat.ts` 的 `historyToAgentMessages` 改为：

- user 端真正空消息仍然丢掉（防御性）；
- assistant 端空 content 不再丢，**替换为占位** `[此前一回合已生成行程卡或完成处理，请勿为该地名重复调用工具。]`。

这是兜底——前端通常会传更具体的城市级摘要，但万一前端没传（旧客户端、abort 路径），backend 仍能给 LLM 一个清晰的"上一轮已完成"信号。

### 3. Prompt 显式约束工具调用范围

`apps/server/src/agent/prompts.ts` 第 4 条加入：

> **不要为历史回合的地名重新调用工具**：消息历史里可能出现 `[已为「xxx」生成完整行程卡...]` 这类摘要，表示之前已经处理过 xxx。当本轮 user 消息提到一个**新地名**时，**只**为这个新地名调用 `getWeather` + `getAttractions` 各一次，**绝不**再为 xxx 复查；当本轮 user 消息没提新地名（只是闲聊或追问），不要调任何工具，直接回答即可。

新增第 5 条：

> **每轮最多一对工具调用**：单轮回复中 `getWeather` 与 `getAttractions` 各只能调用 1 次，参数 `location` 只能取自**当前**这条 user 消息里的地名，不能同时为多个城市并行查询；如果用户在一句话里提到多个城市，请回复请求他二选一。

### 4. Backend 单轮去重硬兜底

即使前三层都失效（譬如换个更野的模型），backend 在 chat 路由内仍要保证"单轮内同名工具最多 emit 一次"：

- 新增 `emittedPublicTools: Set<ToolName>` 跟踪当轮已下发过的工具名。第二次 `tool_start:getWeather` 来时直接跳过，不下发。
- 新增 `emittedToolStartRunIds: Set<string>` 联动：start 阶段被去重抑制的 run_id，对应的 tool_end 也跳过——**不能让第二次工具结果污染 cache**，否则 `buildTripCard` 拿到的 attractions 与 hero 城市不一致。
- 新增 `cardEmitted: boolean`：finalizeTripCard 重复触发时也只下发第一张 card。

## 验证

1. **基本场景**：连发 "上海" → "北京"，EventStream 应只看到 2 个 `tool_start`、2 个 `tool_end`、1 个 `card`，且 card 完全是北京数据。
2. **追问场景**：发 "上海" 拿到行程卡后，紧跟 "推荐三天两夜行程"，模型应**不再调用任何工具**，直接以文本回答。
3. **强压场景**（人工模拟模型抽风）：临时把 prompt 改成允许"为多个城市并行查询"，再连发"上海"→"北京"。即便模型按指令并发，server 端仍只下发北京的一对 tool 事件 + 一张 card——backend 去重生效。
4. **退化场景**：手动清掉 frontend `summarizeAssistantTurn`（模拟旧客户端）。backend 占位兜底应保证 LLM 仍能识别"上一轮已完成"。

## 经验

- **空 content 历史是 LLM 多轮对话的隐形雷区**。但凡设计上让 assistant 回合"以空字符串收尾"，都需要在 history 里补一个**有可读内容**的占位摘要，告诉下一轮的 LLM "这一回合做过什么"。
- **过滤 vs. 替换**：当某个边界条件需要兜底（如 Moonshot 不接受空 message），优先用"替换为占位"而不是"整条过滤"。过滤会破坏对话结构，替换至少保留对话的回合数和先后关系。
- **Prompt 不能默认 LLM 会"自然推断"上下文边界**。需要显式声明"工具调用的地名只来自当前 user 消息"这种约束，而不是依赖模型对历史的理解。
- **后端要为模型行为做防御性去重**。即便 prompt 写得再细，模型仍可能在边界场景抽风（譬如 history 异常长、用户输入歧义）。chat 路由内"单轮同名工具最多 emit 一次"这种**结构性约束**比 prompt 更可靠，应作为标配。
- **Cache 一致性陷阱**：当聚合工具（`finalizeTripCard`）依赖前序工具的 cache 拼装最终结果时，cache 必须保证"来自同一逻辑批次"。任何形式的 cache 覆盖（譬如同名工具第二次结果覆盖第一次）都可能让聚合阶段拼出不一致的数据——这种 bug 视觉上很难定位，因为单看任一字段都"是合法的"。

## 涉及改动

- `apps/web/src/chat/useTravelAgent.ts` — 新增 `summarizeAssistantTurn`
- `apps/server/src/agent/prompts.ts` — 新增"不要为历史地名复查"和"每轮最多一对工具调用"两条约束
- `apps/server/src/routes/chat.ts`
  - `historyToAgentMessages` 把空 assistant content 替换为占位摘要而非过滤
  - 新增 `emittedPublicTools` / `emittedToolStartRunIds` / `cardEmitted` 三套去重状态，覆盖 `on_tool_start` / `on_tool_end` / `finalizeTripCard` 三个分支
