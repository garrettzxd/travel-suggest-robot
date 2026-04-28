// finalize narrative + 裸 weather + 裸 attractions 合并为对前端下发的 TripCard。
import type { Attraction, TripCard, WeatherSnapshot } from "@travel/shared";
import type { FinalizeTripAttractionsSummaryInput } from "../../agent/tools/finalizeTripAttractionsSummary.js";
import type { FinalizeTripCardInput } from "../../agent/tools/finalizeTripCard.js";
import type { FinalizeTripDestinationInput } from "../../agent/tools/finalizeTripDestination.js";
import type { FinalizeTripWeatherInput } from "../../agent/tools/finalizeTripWeather.js";

function firstHeroImageUrl(attractions: Attraction[] | undefined): string | undefined {
  return attractions?.find((a) => a.imageUrl)?.imageUrl;
}

/**
 * 把 finalize narrative + weather + attractions 合并成一张 TripCard。
 * - description / summary / chips / recommendation 全部来自 finalize；
 * - hero.city 优先用 weather.location（已校准的官方城市名），weather 缺失时回退到空串（前端会用 hero.regionPath 兜底显示）。
 * - weather 缺失时 card.weather 整段省略，前端 WeatherCard 切到"天气暂不可用"空态。
 * - attractions 数量不一致时以 attractions 为主，description 按索引补齐，越界的保留原值。
 */
export function buildTripCard(
  finalize: FinalizeTripCardInput,
  weather: WeatherSnapshot | undefined,
  attractions: Attraction[],
): TripCard {
  const mergedAttractions = attractions.map((attraction, index) => {
    const description = finalize.attractions[index]?.description;
    return description ? { ...attraction, description } : attraction;
  });

  // weather 仅在两端都齐时才落到 card.weather；任一缺失就整段省略。
  const weatherBlock =
    weather && finalize.weather?.summary
      ? { ...weather, summary: finalize.weather.summary }
      : undefined;

  // 复用景点照片做城市 Hero 图：第一张带 imageUrl 的景点最有代表性，零额外 API 调用。
  // 没有任何景点带图时省略 heroImageUrl，前端会走斜纹占位。
  const heroImageUrl = firstHeroImageUrl(mergedAttractions);

  return {
    hero: {
      regionCode: finalize.hero.regionCode,
      regionPath: finalize.hero.regionPath,
      city: weather?.location ?? "",
      tagline: finalize.hero.tagline,
      verdictBadge: finalize.hero.verdictBadge,
      ...(heroImageUrl ? { heroImageUrl } : {}),
    },
    ...(weatherBlock ? { weather: weatherBlock } : {}),
    attractions: mergedAttractions,
    recommendation: finalize.recommendation,
    chips: finalize.chips,
  };
}

/**
 * 把地点 narrative 与裸数据缓存合并成 Hero 局部事件。
 * city / heroImageUrl 都由后端从可信工具结果派生，避免模型重复生成事实字段。
 */
export function buildTripHero(
  destination: FinalizeTripDestinationInput,
  weather: WeatherSnapshot | undefined,
  attractions: Attraction[] | undefined,
): TripCard["hero"] {
  const heroImageUrl = firstHeroImageUrl(attractions);
  return {
    regionCode: destination.regionCode,
    regionPath: destination.regionPath,
    city: weather?.location ?? "",
    tagline: destination.tagline,
    verdictBadge: destination.verdictBadge,
    ...(heroImageUrl ? { heroImageUrl } : {}),
  };
}

/**
 * 把天气 summary narrative 合并进裸 WeatherSnapshot。
 * weather 缺失时返回 undefined，调用方据此跳过 card_weather 事件。
 */
export function buildTripWeather(
  weather: WeatherSnapshot | undefined,
  narrative: FinalizeTripWeatherInput,
): (WeatherSnapshot & { summary: string }) | undefined {
  if (!weather) return undefined;
  return { ...weather, summary: narrative.summary };
}

/** 把景点 description narrative 按索引补进裸景点列表。 */
export function mergeAttractionDescriptions(
  attractions: Attraction[],
  narrative: FinalizeTripAttractionsSummaryInput,
): Attraction[] {
  return attractions.map((attraction, index) => {
    const description = narrative.attractions[index]?.description;
    return description ? { ...attraction, description } : attraction;
  });
}
