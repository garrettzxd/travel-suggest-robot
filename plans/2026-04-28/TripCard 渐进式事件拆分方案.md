# TripCard 渐进式事件拆分方案

## 一、需求背景

当前 chat 接口在 TripCard 分支中已经具备第一阶段渐进能力：

- `getWeather` / `getAttractions` 通过 `tool_start` / `tool_end` 下发，前端可以先展示天气、景点裸数据；
- `finalizeTripCard` 在两个公开工具返回后一次性生成地点 Hero、天气 summary、景点 description、出行建议和 chips；
- 前端收到完整 `card` 事件后，才会把剩余 narrative 一次性填入。

这带来的问题是：页面已经展示了地点/天气/景点/总结骨架和部分裸数据，但最后一次完整 `card` 结构化输出较大，用户会在“等完整数据”的状态停留较久。此次改造目标是把完整 `card` 事件拆成更小的局部事件，让地点、天气总结、景点描述与出行总结继续分批渲染。

目标事件流：

```text
tool_start/getWeather,getAttractions
  -> tool_end 裸天气/裸景点
  -> card_destination
  -> card_weather?
  -> card_attractions_summary
  -> final/done
```

其中 `card_weather` 在天气工具失败或缺少天气裸数据时省略。

## 二、目标交互流程

1. 用户输入“我想去杭州”“帮我看厦门适不适合去”等单一目的地实时数据诉求。
2. 后端并行调用 `getWeather` 与 `getAttractions`，前端按现状进入 TripCard 流，显示对应子卡骨架。
3. 天气裸数据返回后，`WeatherCard` 立即展示实时天气与 7 日预报，底部 summary 继续 loading。
4. 景点裸数据返回后，`AttractionList` 立即展示景点名称、分类、评分、距离、图片，description 继续 loading。
5. `card_destination` 到达后，`DestinationHero` 填入城市、行政区链路、tagline、verdict badge 和 hero 图。
6. `card_weather` 到达后，`WeatherCard` 填入整体天气评估 summary。
7. `card_attractions_summary` 到达后，景点 description、`RecommendationPanel` 和 chips 一起完成。
8. 本轮 `final` 内容保持空字符串，前端用结构化卡片完成展示。

边界情况：

- 天气失败：不发送 `card_weather`，天气卡按现有空态处理；地点和景点总结仍可继续生成，但推荐正文不得谈论天气。
- 景点失败：不进入三段 narrative 工具链，直接按现有失败说明收口；因为景点是 TripCard 的最小必要数据。
- 行程规划意图：继续走 `recommendItinerary` / `itinerary`，与 TripCard 分支互斥。
- 普通旅行咨询、美食、人群适配、历史追问：继续走纯文本 token 流，不触发工具链。

## 三、Backend 技术方案

### 3.1 改动文件

| 类型 | 路径 | 动作 |
|---|---|---|
| 共享类型 | `packages/shared/src/travel.ts` | 新增 `ProgressiveTripCard` |
| SSE 类型 | `packages/shared/src/chat.ts` | 扩展 `ToolName` 和 `StreamEvent` |
| 后端工具 | `apps/server/src/agent/tools/finalizeTripDestination.ts` | 新建地点 narrative 工具 |
| 后端工具 | `apps/server/src/agent/tools/finalizeTripWeather.ts` | 新建天气 summary 工具 |
| 后端工具 | `apps/server/src/agent/tools/finalizeTripAttractionsSummary.ts` | 新建景点描述 + 总结工具 |
| Agent 装配 | `apps/server/src/agent/graph.ts` | 注册 3 个新内部工具，移除 `finalizeTripCardTool` 注册 |
| Prompt | `apps/server/src/agent/prompts.ts` | TripCard 分支改为三段 finalize |
| chat 状态 | `apps/server/src/routes/chat/types.ts` | 增加局部缓存与 emitted flags |
| 工具元信息 | `apps/server/src/routes/chat/toolMeta.ts` | 增加 label、内部工具识别、runtime guard |
| TripCard 合并 | `apps/server/src/routes/chat/tripCard.ts` | 增加局部合并 helper |
| SSE handlers | `apps/server/src/routes/chat/handlers.ts` | 增加 3 个内部工具 `on_tool_end` 分支 |

### 3.2 共享类型约定

在 `packages/shared/src/travel.ts` 中新增：

```ts
export interface ProgressiveTripCard {
  hero?: TripCard['hero'];
  weather?: WeatherSnapshot & { summary: string };
  attractions?: Attraction[];
  recommendation?: TripCard['recommendation'];
  chips?: string[];
}
```

在 `packages/shared/src/chat.ts` 中扩展：

```ts
export type ToolName =
  | 'getWeather'
  | 'getAttractions'
  | 'finalizeTripCard'
  | 'finalizeTripDestination'
  | 'finalizeTripWeather'
  | 'finalizeTripAttractionsSummary'
  | 'recommendItinerary';

export type StreamEvent =
  | { type: 'card_destination'; hero: TripCard['hero'] }
  | { type: 'card_weather'; weather: WeatherSnapshot & { summary: string } }
  | {
      type: 'card_attractions_summary';
      attractions: Attraction[];
      recommendation: TripCard['recommendation'];
      chips: string[];
    };
```

保留旧 `card` 事件类型，作为兼容历史逻辑与回滚入口。

### 3.3 新内部工具

三个新工具均参考 `recommendItinerary.ts` 和 `finalizeTripCard.ts`：

- 使用 LangChain `tool(...)` + Zod schema；
- 工具函数只 `return JSON.stringify(input)`；
- 不访问外部 API，不下发 `tool_start` / `tool_end`；
- 由 chat route 在 `on_tool_end` 中消费并转成局部 SSE 事件。

`finalizeTripDestination` schema：

```ts
{
  regionCode: string;
  regionPath: string;
  tagline: string;
  verdictBadge: 'good' | 'caution' | 'avoid';
}
```

说明：只生成地点 Hero narrative。`city` 和 `heroImageUrl` 由后端用天气/景点裸数据合并，避免模型重复编造。

`finalizeTripWeather` schema：

```ts
{
  summary: string;
}
```

说明：仅天气裸数据成功时调用；summary 必须基于 `getWeather` 的真实温度、降水、昼夜温差、风等信息。

`finalizeTripAttractionsSummary` schema：

```ts
{
  attractions: { description: string }[];
  recommendation: {
    tag: string;
    headline: string;
    body: string;
  };
  chips: [string, string, string, string];
}
```

说明：`attractions` 数量与顺序应和 `getAttractions` 返回一致；后端合并时仍以裸景点为主，description 按索引补齐。

### 3.4 chat 状态与合并规则

`ChatStreamState` 新增：

```ts
cachedHero?: TripCard['hero'];
cachedWeatherWithSummary?: WeatherSnapshot & { summary: string };
cachedAttractionsWithDescriptions?: Attraction[];
cachedRecommendation?: TripCard['recommendation'];
cachedChips?: string[];
destinationEmitted: boolean;
weatherSummaryEmitted: boolean;
attractionsSummaryEmitted: boolean;
```

合并规则：

- `buildTripHero(destination, weather, attractions)`：
  - `city` 优先使用 `weather.location`；
  - 天气缺失时用空串，前端继续通过 `regionPath` 兜底；
  - `heroImageUrl` 从第一张带 `imageUrl` 的景点派生。
- `buildTripWeather(weather, narrative)`：
  - 仅当天气裸数据和 summary 都存在时返回；
  - 缺任一字段不 emit `card_weather`。
- `mergeAttractionDescriptions(attractions, narrative)`：
  - 以裸 `attractions` 为准；
  - description 按索引补齐，数量不一致时不丢裸景点。

互斥规则：

- `itineraryEmitted` 后，忽略所有 TripCard 局部事件。
- 任一 TripCard 局部事件已 emit 后，忽略 `recommendItinerary`。
- 旧 `finalizeTripCard` 暂时保留 handler 兼容，但 agent 不再注册该工具。

### 3.5 Prompt 调整

TripCard 工具调用顺序改为：

1. 并行调用 `getWeather` 与 `getAttractions`；
2. 两个公开工具都返回后，调用 `finalizeTripDestination`；
3. 若 `getWeather` 成功，调用 `finalizeTripWeather`；天气失败则跳过；
4. 调用 `finalizeTripAttractionsSummary`；
5. 空字符串结束本轮回复。

失败兜底：

- `getWeather` 失败：跳过 `finalizeTripWeather`，`finalizeTripAttractionsSummary.recommendation.body` 不谈天气。
- `getAttractions` 失败：不要调用三段 finalize，直接一句话说明景点查询失败。

## 四、Frontend 技术方案

### 4.1 改动文件

| 类型 | 路径 | 动作 |
|---|---|---|
| 类型转导 | `apps/web/src/types.ts` | 导出 `ProgressiveTripCard` |
| SSE 消费 | `apps/web/src/chat/useTravelAgent.ts` | 新增 3 个局部事件分支 |
| 卡片组合 | `apps/web/src/chat/cards/TripCardView.tsx` | 增加 `progressiveCard` prop |
| 消息分发 | `apps/web/src/chat/ChatPage.tsx` | `hasStructured` 纳入 progressive 数据 |

### 4.2 消息状态

`TravelChatMessage` 新增：

```ts
progressiveCard?: ProgressiveTripCard;
```

事件处理：

- `card_destination`：patch `progressiveCard.hero`；
- `card_weather`：patch `progressiveCard.weather`；
- `card_attractions_summary`：patch `progressiveCard.attractions/recommendation/chips`；
- 每次 patch 后尝试合成完整 `message.card`，用于历史摘要和旧逻辑兼容。

完整卡合成条件：

- 必须有 `hero`；
- 必须有 `attractions`；
- 必须有 `recommendation`；
- 必须有 `chips`；
- `weather` 可缺失。

### 4.3 TripCardView 取值优先级

```ts
const heroData = card?.hero ?? progressiveCard?.hero;
const weatherData = card?.weather ?? progressiveCard?.weather ?? weather;
const weatherSummary = card?.weather?.summary ?? progressiveCard?.weather?.summary;
const attractionItems = card?.attractions ?? progressiveCard?.attractions ?? attractions;
const recommendationData = card?.recommendation ?? progressiveCard?.recommendation;
const chips = card?.chips ?? progressiveCard?.chips;
```

不改现有子组件 public props：

- `DestinationHero`
- `WeatherCard`
- `AttractionList`
- `RecommendationPanel`

### 4.4 渲染分发

`ChatPage` 中：

- `hasTripCardData` 增加 `message.progressiveCard`；
- 收到 `card_destination` 即进入 TripCard 渲染；
- `TripCardView` 传入 `progressiveCard={message.progressiveCard}`；
- `settled=true` 后仍缺失的区块继续沿用现有空态。

## 五、验证用例

| 用例 | 期望事件流 | 期望渲染 |
|---|---|---|
| “我想去杭州” | `tool_start` / `tool_end` / `card_destination` / `card_weather` / `card_attractions_summary` | Hero、天气 summary、景点描述和总结分批补齐 |
| “我想去厦门” | 同上 | 裸天气、裸景点仍先展示 |
| 天气工具失败 | 无 `card_weather` | 天气卡空态，地点、景点、总结仍展示 |
| 景点工具失败 | 无局部 TripCard 事件 | 返回景点查询失败说明 |
| “杭州三天两晚怎么规划” | 仅 `itinerary` | ItineraryCard 正常 |
| “海南美食攻略有吗” | token/final/done | Markdown 文本，无结构化卡片 |
| 已有 TripCard 后追问“雨天室内去哪” | token/final/done | 自然语言回答，不重复调工具 |

## 六、执行检查

```bash
pnpm --filter @travel/shared exec tsc --noEmit
pnpm --filter @travel/server exec tsc --noEmit
pnpm --filter @travel/web exec tsc --noEmit
```

本次不新增依赖，不改现有子卡组件 public props，`finalizeTripCard.ts` 暂时保留但不注册，便于回滚。
