// chat 路由结束时的持久化工具：从 ChatStreamState 提取要落库的 assistant 制品。
//
// 数据来源说明：
// - finalContent：纯文本回复时非空；TripCard 渐进流短路时被清空（handlers L386）；
// - cachedFinalTripCard：handleFinalizeTripCardEnd 直接合成的完整 TripCard；
// - cachedHero / cachedWeatherWithSummary / cachedAttractionsWithDescriptions
//   / cachedRecommendation / cachedChips：渐进式 TripCard 流的局部缓存，
//   全齐时本函数自行组装一张完整 TripCard 落库；
// - cachedItinerary：handleRecommendItineraryEnd 落进来的完整 Itinerary。
import type { Itinerary, TripCard } from "@travel/shared";
import type { ChatStreamState } from "./types.js";

/** route.ts finally 块要落库的 assistant 制品。 */
export interface AssistantArtifacts {
  content: string;
  card?: TripCard;
  itinerary?: Itinerary;
}

/**
 * 从结束态 state 拼装要写库的 assistant 制品。
 * - 优先使用 cachedFinalTripCard；
 * - 否则尝试用渐进式缓存合并（hero + weather + attractions + recommendation + chips 全齐）；
 * - 都没有再看 cachedItinerary。
 * 三者可同时为空：例如纯文本回复 / 错误中断 / 短路前异常。
 */
export function extractAssistantArtifacts(state: ChatStreamState): AssistantArtifacts {
  const card = state.cachedFinalTripCard ?? assembleProgressiveTripCard(state);
  const itinerary = state.cachedItinerary;
  return {
    content: state.finalContent,
    ...(card ? { card } : {}),
    ...(itinerary ? { itinerary } : {}),
  };
}

/**
 * 渐进式 TripCard 流：handleFinalizeTripAttractionsSummaryEnd 后短路，
 * 卡片各部分散落在 state.cached* 字段，需要在持久化前合一。
 *
 * 缺关键部分（hero / attractions+description）则直接放弃合成——
 * 这些场景下前端拿到的也是不完整的局部事件，DB 不存比存半截更干净。
 */
function assembleProgressiveTripCard(state: ChatStreamState): TripCard | undefined {
  const hero = state.cachedHero;
  const attractions = state.cachedAttractionsWithDescriptions;
  const recommendation = state.cachedRecommendation;
  const chips = state.cachedChips;
  if (!hero || !attractions || !recommendation || !chips) {
    return undefined;
  }
  return {
    hero,
    ...(state.cachedWeatherWithSummary
      ? { weather: state.cachedWeatherWithSummary }
      : {}),
    attractions,
    recommendation,
    chips,
  };
}
