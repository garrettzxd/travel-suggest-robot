# 卡片流场景下空白卡片与 LLM 续流冗余

## 问题表现

聊天 UI 在两类卡片流场景里都暴露出"渲染了用不上的占位 / 后端浪费时间烧 token"的问题：

**1) 仅查询天气**（如"查询一下北京的天气"）

- 后端 SSE 事件序列：`tool_start(getWeather)` → `tool_end(getWeather)` → `card_weather` → 几十条 `token` → `final` → `done`。
- 前端 assistant 消息却把整个 TripCardView（5 块）骨架顶上：
  - LOCATION 槽：「未生成地点总结，助手未能完成行程卡的生成…」
  - 景点推荐槽：「景点接口暂未返回数据」
  - 出行建议槽：「未生成出行建议」
  - WeatherCard 正常 + 「整体评估」位置一直是 `Skeleton.Input` 灰条。
- 体验上看起来"接口出错了"。

**2) 完整 TripCard 流**（如"我想去上海"）

观察到的 SSE 时间戳片段：

```
15:16:29.796  tool_start  getWeather + getAttractions
15:16:30.046  tool_end    getAttractions
15:16:30.094  tool_end    getWeather
15:16:38.387  card_weather
15:16:38.387  card_destination
15:16:49.677  card_attractions_summary
15:17:18.438  token       "["
...
15:17:18.567  final       {"content":"[已为「上海」生成完整行程卡，包含天气、景点及出行建议。]"}
15:17:18.567  done
```

- `card_attractions_summary` 之后所有结构化数据已齐，前端可以立刻完整渲染。
- 但 LLM 还在续写，从 `card_attractions_summary` 到 `final` 实测等了 **~29 秒**，期间用户看到的仍然是已经渲染好的卡片，纯属浪费等待时间和 token。

## 问题原因

### 1. 前端 TripCardView 永远渲染全部 5 个槽位

[apps/web/src/chat/cards/TripCardView/TripCardView.tsx](../apps/web/src/chat/cards/TripCardView/TripCardView.tsx) 旧实现里 Hero / Weather / Attractions / Recommendation / Chips 五块是无条件输出 JSX，仅依赖 `data` / `loading` / `settled` 决定子组件内部走骨架还是空态。`settled=true` 但数据缺失时退化为占位文案——这就是仅查天气场景看到的「未生成地点总结」等串。

### 2. ChatPage 切换到卡片流的判定过于宽松

[apps/web/src/chat/ChatPage/ChatPage.tsx](../apps/web/src/chat/ChatPage/ChatPage.tsx) 旧逻辑：

```ts
if (message.hasToolStart || hasTripCardData) {
  // 渲染 TripCardView
}
```

`hasToolStart` 在收到任意 `tool_start` 事件就置 true（[useTravelAgent.ts](../apps/web/src/chat/useTravelAgent.ts)），导致 `getWeather` 一启动就把整套 TripCardView 推上去，没有信号区分"本轮意图是单工具还是完整 TripCard"。

### 3. 误判 cardFlow 的隐藏陷阱

最初设想"用 `progressiveCard || card` 是否存在判定是否进入完整 TripCard 流"，实测翻车：

- 后端 [handlers.ts:288](../apps/server/src/routes/chat/handlers.ts:288) 在 `finalizeTripWeather` 工具结束时无条件 emit `card_weather`。
- agent prompt 即使在仅查询天气时也会调用 `finalizeTripWeather` 来生成 summary。
- 结果：仅天气场景下 `progressiveCard.weather` 也会被填充，`progressiveCard` 整体存在，被误判为完整流，五块全展开。
- 唯一可靠的「完整流信号」是 `card_destination`（→ `progressiveCard.hero`）或 `card_attractions_summary`（→ `progressiveCard.recommendation`），它们只在 finalizeTripDestination / finalizeTripAttractionsSummary 跑过时才到达。

### 4. 后端 LLM 续流没有任何信息增量

- `card_weather` 的 payload 里已经带了 7 日预报 + summary 文本（[handlers.ts:271-288](../apps/server/src/routes/chat/handlers.ts:271)）。
- `card_attractions_summary` 的 payload 已经带了完整景点列表 / recommendation / chips（[handlers.ts:344-364](../apps/server/src/routes/chat/handlers.ts:344)）。
- agent prompt step5 本就要求"调完 finalizeTripAttractionsSummary 后**直接以空字符串结束本轮回复**"，但 LLM 实测仍续写"[已为「xxx」生成完整行程卡…]"这种字符串。
- 前端 `useTravelAgent.summarizeAssistantTurn` 在 history 阶段会基于 `message.card` 自合成更准确的摘要（带景点数量），LLM 那段输出实际**根本没人用**，纯白烧。

## 解决方法

### 改动 1：前端 useTravelAgent 记录 `toolsStarted`

[apps/web/src/chat/useTravelAgent.ts](../apps/web/src/chat/useTravelAgent.ts)：

- `TravelChatMessage` 加 `toolsStarted?: ToolName[]`。
- `tool_start` 分支用 `setMessages(prev => prev.map(...))` 把工具名追加到当前 assistant 消息（去重），保留 `hasToolStart` 旧行为兼容。

仅 `getWeather` / `getAttractions` 会真的发 `tool_start`（其它都是内部工具），因此 `toolsStarted` 实际只会包含这两者。

### 改动 2：TripCardView 按槽位条件渲染

[apps/web/src/chat/cards/TripCardView/TripCardView.tsx](../apps/web/src/chat/cards/TripCardView/TripCardView.tsx)：

```ts
// 必须用 hero / recommendation 判定，不能用整个 progressiveCard
const cardFlow = !!(card || progressiveCard?.hero || progressiveCard?.recommendation);
const startedWeather     = toolsStarted?.includes('getWeather') ?? false;
const startedAttractions = toolsStarted?.includes('getAttractions') ?? false;

const showHero           = !!heroData            || cardFlow;
const showWeather        = !!weatherData         || startedWeather    || cardFlow;
const showAttractions    = !!attractionItems     || startedAttractions || cardFlow;
const showRecommendation = !!recommendationData  || cardFlow;
const showChips          = !!chips               || cardFlow;
```

`show*` 为 false 时整段 JSX 跳过（不留 DOM 也不留骨架）。同时 Props 加 `fallbackNarrative?: string` 兜底 weather-only 极端场景下 `card_weather.summary` 缺失时把 `final.content` 注入 WeatherCard 的「整体评估」。

| 场景 | toolsStarted | cardFlow | 实际渲染 |
| --- | --- | --- | --- |
| 仅 `getWeather` | `['getWeather']` | false | WeatherCard ✅ |
| `getWeather` + `getAttractions`，未进 finalize | 两个都有 | false | WeatherCard + AttractionList |
| 完整 TripCard 流 | 同上 | true | 全套 5 块（含骨架） |
| 闲聊 | `[]`，`hasToolStart=false` | false | 走 markdown 兜底 |

### 改动 3：ChatPage 透传新 props + 计算 fallbackNarrative

[apps/web/src/chat/ChatPage/ChatPage.tsx](../apps/web/src/chat/ChatPage/ChatPage.tsx)：透传 `toolsStarted` / `fallbackNarrative`；`inCardFlow` 判定同步收紧为 `!!(message.card || message.progressiveCard?.hero || message.progressiveCard?.recommendation)`。

### 改动 4：后端通用短路标志

仅前端裁剪救不了后端 LLM 续流。在 [apps/server/src/routes/chat/types.ts](../apps/server/src/routes/chat/types.ts) 的 `ChatStreamState` 加：

```ts
shouldShortCircuit: boolean; // 默认 false
```

#### 4.1 weather-only 场景置位

[apps/server/src/routes/chat/handlers.ts](../apps/server/src/routes/chat/handlers.ts) 的 `handleFinalizeTripWeatherEnd`，在 emit `card_weather` 之后：

```ts
if (!state.destinationEmitted && !state.cachedAttractions) {
  state.shouldShortCircuit = true;
  state.finalContent = weather.summary;
}
```

两个守卫等价于"无完整流前置步骤"——完整流里跑到 weather 节点时 `destinationEmitted` 必为 true（prompt 强制 step2 destination → step3 weather），不会误伤。

#### 4.2 完整 TripCard 流场景置位

同文件 `handleFinalizeTripAttractionsSummaryEnd`，在 emit `card_attractions_summary` 之后无条件置位：

```ts
state.shouldShortCircuit = true;
state.finalContent = "";
```

`finalContent` 留空让前端 `summarizeAssistantTurn` 自合成含景点数量的摘要，比 LLM 输出更准确。

#### 4.3 route.ts break + abort

[apps/server/src/routes/chat/route.ts](../apps/server/src/routes/chat/route.ts) 主循环每个事件后检查标志，触发即 `break`；循环外主动 `abortController.abort()` 停掉残余 LangGraph stream，然后正常 `emit("final")` + `emit("done")`：

```ts
if (state.shouldShortCircuit && !abortController.signal.aborted) {
  abortController.abort();
}
if (state.shouldShortCircuit || !abortController.signal.aborted) {
  emitEvent("final", { content: state.finalContent });
  emitEvent("done", {});
}
```

边界：
- `getWeather` 失败 → `finalizeTripWeather` 通常被跳过；即便被调用也会因 `state.cachedWeather` 缺失走"跳过 card_weather"分支，标志不置位，回退原 LLM 续流。
- `finalizeTripAttractionsSummary` 在 `cachedAttractions` 缺失或返回体非法时直接 return，不 emit 也不置标志。
- 用户主动断连 → `abortController.signal.aborted` 已为 true，标志不影响 catch 走 abort 分支。

## 验证方式

1. `pnpm --filter @travel/server dev` + `pnpm --filter @travel/web dev`。
2. 浏览器 DevTools Network 面板看 `/api/chat` 的 EventStream：

   - **仅天气**："查询一下北京的天气" → SSE 应在 `card_weather` 之后**立刻** `final` + `done`，没有几十条后续 token；UI 只渲染一张 WeatherCard，「整体评估」展示 `card_weather.weather.summary` 文本。
   - **完整行程**："我想去上海" → SSE 在 `card_attractions_summary` 之后**立刻** `final`（content 为空）+ `done`，没有 LLM 续流的 token；UI 5 块 + chips 渐进显示；点开历史 message 看 history 摘要由前端合成为 `[已为「上海」生成完整行程卡（含天气、N 条景点、出行建议）…]`。
   - **闲聊**："你好" → 直接 token + final，无 card / tool 事件，UI markdown 气泡兜底。

3. typecheck：
   - `pnpm --filter @travel/web typecheck`
   - `pnpm --filter @travel/server typecheck`

## 附带排除过的可能性

- ❌ "用 `progressiveCard || card` 判定是否进入完整 TripCard 流" —— `card_weather` 单独到达也会让 `progressiveCard` 存在，仅天气场景误判为完整流，5 块全展开。最终修正为 `progressiveCard?.hero || progressiveCard?.recommendation`。
- ❌ "改 system prompt 让 LLM 在 weather-only / 完整流终态主动以空字符串结束" —— prompt step5 本来就这么写了，但 LLM 实际不遵守仍会续写。靠 prompt 约束不靠谱，必须在路由层物理 abort。
- ❌ "把后端不动，纯前端通过 settled 状态隐藏空槽" —— 解决不了后端 LLM 续流烧 token 的问题；而且骨架 → 退化为空态的过程仍然会闪一下，体验不好。
