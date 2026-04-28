// LangGraph streamEvents 三类事件的处理器：模型 token 流、tool_start、tool_end。
// route.ts 主循环按 event.event 分派到这三个 handler，handler 共享 ChatStreamState。
import type { Attraction, Itinerary, TripCard, WeatherSnapshot } from "@travel/shared";
import type { ChatRouteLogger } from "./logger.js";
import { extractTextDelta, extractToolResult, normalizeToolPayload } from "./streamParsers.js";
import {
  isFinalizeInput,
  isInternalToolName,
  isPublicToolName,
  isRecommendItineraryInput,
  isTripAttractionsSummaryInput,
  isTripDestinationInput,
  isTripWeatherInput,
  toolLabel,
} from "./toolMeta.js";
import { previewJson } from "./logger.js";
import {
  buildTripCard,
  buildTripHero,
  buildTripWeather,
  mergeAttractionDescriptions,
} from "./tripCard.js";
import type { ChatStreamState, EventWriter, LangChainStreamEvent } from "./types.js";

/** handlers 共用的依赖：emit 与 logger，避免每个函数签名带一长串参数。 */
export interface HandlerDeps {
  emitEvent: EventWriter;
  log: ChatRouteLogger;
}

/**
 * 处理 `on_chat_model_stream` 事件：抽出文本增量，累加到 finalContent，emit 'token'。
 *
 * 空 delta 不逐条打日志：模型流在每次工具调用阶段会推回大量 content="" 的元数据 chunk
 * （tool_call_chunks 拼装期间的常态），这是 LangChain + OpenAI 兼容协议的固有行为，
 * 既非异常也无 actionable 信息。这里只把数量累加到 state.skippedEmptyChunkCount，
 * 由 route.ts 在 stream 收尾时打一行汇总，避免一次会话刷出 40+ 行噪声。
 */
export function handleModelStream(
  event: LangChainStreamEvent,
  state: ChatStreamState,
  { emitEvent }: HandlerDeps,
): void {
  const delta = extractTextDelta(event.data?.chunk);
  if (!delta) {
    state.skippedEmptyChunkCount += 1;
    return;
  }

  state.finalContent += delta;
  emitEvent("token", { delta });
}

/**
 * 处理 `on_tool_start` 事件：
 * - 内部工具（finalizeTrip* / recommendItinerary）不向前端 emit；
 * - 公开工具按 run_id 去重，并在单轮内做"同名工具仅放过第一次"的硬限制；
 * - 通过的调用以 'tool_start' SSE 事件下发，并把 run_id 标到 emittedToolStartRunIds，
 *   供 handleToolEnd 决定是否要落 cache + emit 对应的 'tool_end'。
 */
export function handleToolStart(
  event: LangChainStreamEvent,
  state: ChatStreamState,
  { emitEvent, log }: HandlerDeps,
): void {
  // 内部工具不对外暴露 tool_start。
  if (isInternalToolName(event.name)) {
    log.debug("内部工具启动（不下发）", { toolName: event.name, runId: event.run_id });
    return;
  }
  if (!isPublicToolName(event.name)) {
    return;
  }
  if (state.startedToolCalls.has(event.run_id)) {
    return;
  }
  // 单轮内同名工具最多 emit 一次：LLM 偶尔会并行调多次（譬如混上历史地名），
  // 第二次以后直接吞掉，避免前端基于"最后一次"覆盖、导致 weather/attractions 错位。
  if (state.emittedPublicTools.has(event.name)) {
    log.warn("同名工具在单轮内被重复触发，已忽略多余调用", {
      toolName: event.name,
      runId: event.run_id,
    });
    state.startedToolCalls.add(event.run_id);
    return;
  }

  state.startedToolCalls.add(event.run_id);
  state.emittedPublicTools.add(event.name);
  state.emittedToolStartRunIds.add(event.run_id);
  const args = normalizeToolPayload(event.data?.input ?? {});
  log.toolCall(toolLabel(event.name), {
    toolCallId: event.run_id,
    toolName: event.name,
    args,
  });
  emitEvent("tool_start", {
    name: event.name,
    args,
  });
}

/**
 * 处理 `on_tool_end` 事件：按工具名分派到三个内部分支函数。
 * - recommendItinerary → emit 'itinerary'
 * - finalizeTripDestination / finalizeTripWeather / finalizeTripAttractionsSummary → emit 渐进式 card_* 事件
 * - finalizeTripCard → 保留兼容，合并 weather + attractions + narrative → emit 'card'
 * - 公开工具（getWeather / getAttractions） → 写 cache + emit 'tool_end'
 */
export function handleToolEnd(
  event: LangChainStreamEvent,
  state: ChatStreamState,
  deps: HandlerDeps,
): void {
  if (event.name === "recommendItinerary") {
    handleRecommendItineraryEnd(event, state, deps);
    return;
  }
  if (event.name === "finalizeTripCard") {
    handleFinalizeTripCardEnd(event, state, deps);
    return;
  }
  if (event.name === "finalizeTripDestination") {
    handleFinalizeTripDestinationEnd(event, state, deps);
    return;
  }
  if (event.name === "finalizeTripWeather") {
    handleFinalizeTripWeatherEnd(event, state, deps);
    return;
  }
  if (event.name === "finalizeTripAttractionsSummary") {
    handleFinalizeTripAttractionsSummaryEnd(event, state, deps);
    return;
  }
  if (isPublicToolName(event.name)) {
    handlePublicToolEnd(event, state, deps);
  }
}

/**
 * recommendItinerary 结束：emit 'itinerary'，不再走公开 tool_end。
 * 单轮只允许一张结构化卡片；若 TripCard 已出，itinerary 静默丢弃。
 */
function handleRecommendItineraryEnd(
  event: LangChainStreamEvent,
  state: ChatStreamState,
  { emitEvent, log }: HandlerDeps,
): void {
  if (state.completedToolCalls.has(event.run_id)) {
    return;
  }
  state.completedToolCalls.add(event.run_id);
  if (state.itineraryEmitted || state.cardEmitted) {
    log.warn("recommendItinerary 在单轮内被重复触发或与 card 冲突，已忽略", {
      runId: event.run_id,
      cardEmitted: state.cardEmitted,
      itineraryEmitted: state.itineraryEmitted,
    });
    return;
  }

  const itineraryResult = extractToolResult(event.data?.output);
  if (!isRecommendItineraryInput(itineraryResult)) {
    log.warn("recommendItinerary 返回体不合法，跳过 itinerary 事件", {
      runId: event.run_id,
      preview: previewJson(itineraryResult),
    });
    return;
  }

  const itinerary: Itinerary = itineraryResult;
  state.itineraryEmitted = true;
  log.toolResult(toolLabel("recommendItinerary"), {
    toolCallId: event.run_id,
    toolName: "recommendItinerary",
    resultPreview: previewJson({
      title: itinerary.title,
      days: itinerary.days.length,
      hasFootnote: !!itinerary.footnote,
    }),
  });
  emitEvent("itinerary", { itinerary });
}

/**
 * finalizeTripDestination 结束：补齐后端可信字段后 emit 'card_destination'。
 * 此事件一旦下发，代表本轮已进入 TripCard 分支，后续 itinerary 会被互斥抑制。
 */
function handleFinalizeTripDestinationEnd(
  event: LangChainStreamEvent,
  state: ChatStreamState,
  { emitEvent, log }: HandlerDeps,
): void {
  if (state.completedToolCalls.has(event.run_id)) {
    return;
  }
  state.completedToolCalls.add(event.run_id);
  if (state.destinationEmitted || state.itineraryEmitted) {
    log.warn("finalizeTripDestination 在单轮内重复触发或与 itinerary 冲突，已忽略", {
      runId: event.run_id,
      destinationEmitted: state.destinationEmitted,
      itineraryEmitted: state.itineraryEmitted,
    });
    return;
  }

  const destination = extractToolResult(event.data?.output);
  if (!isTripDestinationInput(destination)) {
    log.warn("finalizeTripDestination 返回体不合法，跳过地点事件", {
      runId: event.run_id,
      preview: previewJson(destination),
    });
    return;
  }
  if (!state.cachedAttractions) {
    log.warn("缺少 attractions 裸数据，无法生成地点 Hero", {
      hasWeather: !!state.cachedWeather,
      hasAttractions: !!state.cachedAttractions,
    });
    return;
  }

  const hero = buildTripHero(destination, state.cachedWeather, state.cachedAttractions);
  state.cachedHero = hero;
  state.destinationEmitted = true;
  state.cardEmitted = true;
  log.toolResult(toolLabel("finalizeTripDestination"), {
    toolCallId: event.run_id,
    toolName: "finalizeTripDestination",
    resultPreview: previewJson({
      city: hero.city,
      regionPath: hero.regionPath,
      verdict: hero.verdictBadge,
      hasHeroImage: !!hero.heroImageUrl,
    }),
  });
  emitEvent("card_destination", { hero });
}

/**
 * finalizeTripWeather 结束：把 summary 合并进缓存的 WeatherSnapshot 后 emit 'card_weather'。
 * weather 裸数据缺失时静默降级，不编造天气 summary。
 */
function handleFinalizeTripWeatherEnd(
  event: LangChainStreamEvent,
  state: ChatStreamState,
  { emitEvent, log }: HandlerDeps,
): void {
  if (state.completedToolCalls.has(event.run_id)) {
    return;
  }
  state.completedToolCalls.add(event.run_id);
  if (state.weatherSummaryEmitted || state.itineraryEmitted) {
    log.warn("finalizeTripWeather 在单轮内重复触发或与 itinerary 冲突，已忽略", {
      runId: event.run_id,
      weatherSummaryEmitted: state.weatherSummaryEmitted,
      itineraryEmitted: state.itineraryEmitted,
    });
    return;
  }

  const weatherNarrative = extractToolResult(event.data?.output);
  if (!isTripWeatherInput(weatherNarrative)) {
    log.warn("finalizeTripWeather 返回体不合法，跳过天气总结事件", {
      runId: event.run_id,
      preview: previewJson(weatherNarrative),
    });
    return;
  }

  const weather = buildTripWeather(state.cachedWeather, weatherNarrative);
  if (!weather) {
    log.debug("getWeather 缺失，跳过 card_weather 事件");
    return;
  }

  state.cachedWeatherWithSummary = weather;
  state.weatherSummaryEmitted = true;
  state.cardEmitted = true;
  log.toolResult(toolLabel("finalizeTripWeather"), {
    toolCallId: event.run_id,
    toolName: "finalizeTripWeather",
    resultPreview: previewJson({
      location: weather.location,
      summary: weather.summary,
    }),
  });
  emitEvent("card_weather", { weather });

  // weather-only 短路：纯天气查询（没有 finalizeTripDestination 也没有 getAttractions），
  // card_weather 已带完整 7 日数据 + summary，没必要让 LLM 再续写一段重复 markdown。
  // 置标志后由 route.ts 主循环 break 并 abort agent stream，直接走 final + done。
  // 完整 TripCard 流里 finalizeTripWeather 跑到时 destinationEmitted 必为 true（prompt 强制
  // step2 destination → step3 weather），不会被误判。
  if (!state.destinationEmitted && !state.cachedAttractions) {
    state.weatherOnlyShortCircuit = true;
    state.finalContent = weather.summary;
    log.debug("weather-only 流程，card_weather 后短路 LLM 续流", {
      runId: event.run_id,
      summaryPreview: previewJson(weather.summary),
    });
  }
}

function recommendationTagForVerdict(verdict: string | undefined): string | undefined {
  if (verdict === "good") return "推荐 · 近期出发";
  if (verdict === "caution") return "谨慎 · 建议调整";
  if (verdict === "avoid") return "不建议 · 近期出发";
  return undefined;
}

function normalizeRecommendation(
  recommendation: TripCard["recommendation"],
  hero: TripCard["hero"] | undefined,
): TripCard["recommendation"] {
  const tag = recommendationTagForVerdict(hero?.verdictBadge);
  return tag ? { ...recommendation, tag } : recommendation;
}

/**
 * finalizeTripAttractionsSummary 结束：合并景点 description，并 emit 出行建议与 chips。
 * 这是 TripCard 渐进链路的最后一段，但 weather 允许缺失。
 */
function handleFinalizeTripAttractionsSummaryEnd(
  event: LangChainStreamEvent,
  state: ChatStreamState,
  { emitEvent, log }: HandlerDeps,
): void {
  if (state.completedToolCalls.has(event.run_id)) {
    return;
  }
  state.completedToolCalls.add(event.run_id);
  if (state.attractionsSummaryEmitted || state.itineraryEmitted) {
    log.warn("finalizeTripAttractionsSummary 在单轮内重复触发或与 itinerary 冲突，已忽略", {
      runId: event.run_id,
      attractionsSummaryEmitted: state.attractionsSummaryEmitted,
      itineraryEmitted: state.itineraryEmitted,
    });
    return;
  }

  const summary = extractToolResult(event.data?.output);
  if (!isTripAttractionsSummaryInput(summary)) {
    log.warn("finalizeTripAttractionsSummary 返回体不合法，跳过景点与总结事件", {
      runId: event.run_id,
      preview: previewJson(summary),
    });
    return;
  }
  if (!state.cachedAttractions) {
    log.warn("缺少 attractions 裸数据，无法生成景点描述与出行建议", {
      hasWeather: !!state.cachedWeather,
      hasAttractions: !!state.cachedAttractions,
    });
    return;
  }

  const attractions = mergeAttractionDescriptions(state.cachedAttractions, summary);
  const recommendation = normalizeRecommendation(summary.recommendation, state.cachedHero);
  state.cachedAttractionsWithDescriptions = attractions;
  state.cachedRecommendation = recommendation;
  state.cachedChips = summary.chips;
  state.attractionsSummaryEmitted = true;
  state.cardEmitted = true;
  log.toolResult(toolLabel("finalizeTripAttractionsSummary"), {
    toolCallId: event.run_id,
    toolName: "finalizeTripAttractionsSummary",
    resultPreview: previewJson({
      attractions: attractions.length,
      recommendationTag: recommendation.tag,
      chips: summary.chips.length,
    }),
  });
  emitEvent("card_attractions_summary", {
    attractions,
    recommendation,
    chips: summary.chips,
  });
}

/**
 * finalizeTripCard 结束：合并 cache 中的 weather + attractions 与 narrative，emit 'card'。
 * - 单轮只下发一张 card；LLM 重复调时第二次起静默丢弃；
 * - attractions 是必要数据，缺失则放弃 card 合并；
 * - weather 缺失允许下发（前端 WeatherCard 走空态）。
 */
function handleFinalizeTripCardEnd(
  event: LangChainStreamEvent,
  state: ChatStreamState,
  { emitEvent, log }: HandlerDeps,
): void {
  if (state.completedToolCalls.has(event.run_id)) {
    return;
  }
  state.completedToolCalls.add(event.run_id);
  if (state.cardEmitted || state.itineraryEmitted) {
    log.warn("finalizeTripCard 在单轮内被重复触发或与 itinerary 冲突，已忽略多余 card", {
      runId: event.run_id,
      cardEmitted: state.cardEmitted,
      itineraryEmitted: state.itineraryEmitted,
    });
    return;
  }

  const finalize = extractToolResult(event.data?.output);
  if (!isFinalizeInput(finalize)) {
    log.warn("finalizeTripCard 返回体不合法，跳过 card 合并", {
      runId: event.run_id,
      preview: previewJson(finalize),
    });
    return;
  }
  if (!state.cachedAttractions) {
    // attractions 是行程卡的最小必要数据；weather 缺失允许下发 card（前端 WeatherCard 自行降级到空态）。
    log.warn("缺少 attractions 裸数据，无法合并 TripCard", {
      hasWeather: !!state.cachedWeather,
      hasAttractions: !!state.cachedAttractions,
    });
    return;
  }
  if (!state.cachedWeather) {
    log.debug("getWeather 缺失，按降级模式合并 TripCard（card.weather 将省略）");
  }

  const card = buildTripCard(finalize, state.cachedWeather, state.cachedAttractions);
  state.cardEmitted = true;
  log.toolResult(toolLabel("finalizeTripCard"), {
    toolCallId: event.run_id,
    toolName: "finalizeTripCard",
    resultPreview: previewJson({
      city: card.hero.city,
      verdict: card.hero.verdictBadge,
      attractions: card.attractions.length,
      chips: card.chips.length,
    }),
  });
  emitEvent("card", { card });
}

/**
 * 公开工具（getWeather / getAttractions）结束：
 * - 若对应 run_id 在 start 阶段被去重抑制，end 也跳过，避免污染 cache；
 * - 否则把结构化结果写入 state.cached*，并 emit 'tool_end' 给前端展示。
 */
function handlePublicToolEnd(
  event: LangChainStreamEvent,
  state: ChatStreamState,
  { emitEvent, log }: HandlerDeps,
): void {
  // 类型守卫：handleToolEnd 已用 isPublicToolName 把分支限定到这里，但 TS 跨函数无法保留窄化，
  // 这里再做一次断言把 event.name 收窄到 "getWeather" | "getAttractions"，便于后续传给 toolLabel。
  if (!isPublicToolName(event.name)) {
    return;
  }
  const toolName = event.name;

  if (state.completedToolCalls.has(event.run_id)) {
    return;
  }

  state.completedToolCalls.add(event.run_id);

  // 该 run_id 在 start 阶段被 dedup 抑制了 → end 也跳过，不污染 cache。
  // 否则第二次工具结果（譬如历史地名"上海"的数据）会覆盖第一次（当前"北京"）的 cache。
  if (!state.emittedToolStartRunIds.has(event.run_id)) {
    log.debug("跳过被去重抑制的 tool_end", {
      toolName: event.name,
      runId: event.run_id,
    });
    return;
  }

  const result = extractToolResult(event.data?.output);

  // 缓存供 finalizeTripCard 合并时复用；解析失败（如工具抛错导致 result 变成字符串）则不缓存。
  if (toolName === "getWeather" && result && typeof result === "object") {
    state.cachedWeather = result as WeatherSnapshot;
  } else if (toolName === "getAttractions" && Array.isArray(result)) {
    state.cachedAttractions = result as Attraction[];
  }

  log.toolResult(toolLabel(toolName), {
    toolCallId: event.run_id,
    toolName,
    resultPreview: previewJson(result),
  });
  emitEvent("tool_end", {
    name: toolName,
    result,
  });
}
