import type { ProgressiveTripCard, TripCard } from '@travel/shared';
import type { TravelChatMessage } from '../types';

/**
 * 通用 patch 助手：找到 id 匹配的 assistant 消息并应用 patch；
 * 不存在或非 assistant 时原数组返回，避免误伤 user 气泡。
 * @param messages 当前消息列表
 * @param id 目标 assistant 消息 id
 * @param patch 待合并的字段
 */
export function patchAssistantMessage(
  messages: TravelChatMessage[],
  id: string,
  patch: Partial<TravelChatMessage>,
): TravelChatMessage[] {
  return messages.map((entry) =>
    entry.id === id && entry.role === 'assistant' ? { ...entry, ...patch } : entry,
  );
}

/**
 * 渐进式 TripCard 数据齐备后合成旧 TripCard，保持历史摘要与旧渲染路径兼容。
 * @param progressiveCard 当前累积到的局部数据
 * @returns 字段全齐时返回完整 TripCard，否则 undefined
 */
export function tryBuildCardFromProgressive(
  progressiveCard: ProgressiveTripCard,
): TripCard | undefined {
  if (
    !progressiveCard.hero ||
    !progressiveCard.attractions ||
    !progressiveCard.recommendation ||
    !progressiveCard.chips
  ) {
    return undefined;
  }

  return {
    hero: progressiveCard.hero,
    ...(progressiveCard.weather ? { weather: progressiveCard.weather } : {}),
    attractions: progressiveCard.attractions,
    recommendation: progressiveCard.recommendation,
    chips: progressiveCard.chips,
  };
}

/**
 * 对当前 assistant 消息做局部 TripCard patch，并在可能时同步合成完整 card。
 * @param messages 当前消息列表
 * @param id 目标 assistant 消息 id
 * @param patch 本次到达的局部字段（card_destination / card_weather / card_attractions_summary）
 */
export function patchProgressiveCard(
  messages: TravelChatMessage[],
  id: string,
  patch: ProgressiveTripCard,
): TravelChatMessage[] {
  return messages.map((entry) => {
    if (entry.id !== id || entry.role !== 'assistant') return entry;
    const progressiveCard = { ...entry.progressiveCard, ...patch };
    const card = tryBuildCardFromProgressive(progressiveCard) ?? entry.card;
    return {
      ...entry,
      progressiveCard,
      ...(card ? { card } : {}),
      status: 'updating',
    };
  });
}
