import type { ChatMessage } from '@travel/shared';
import type { TravelChatMessage } from '../types';

/**
 * 给已经渲染过结构化卡片的 assistant 历史回合合成一条"已完成"摘要。
 * - prompt 让 LLM 调完工具链后空字符串收尾，导致 history 里 content="";
 *   下游 LLM 看到空 assistant 回合会误以为上一轮没完成，对历史地名重复调工具。
 * - 这里把空 content + 有结构化数据的 assistant 消息替换成 "[已为「xxx」生成行程卡...]"，
 *   让模型清楚那一轮已收口，新一轮只需处理当前用户消息。
 *
 * 新增结构化卡片类型时，在这里追加分支即可。
 */
export function summarizeAssistantTurn(message: TravelChatMessage): string {
  if (message.role !== 'assistant') return message.content;
  if (message.content.trim()) return message.content;

  if (message.card) {
    const city = message.card.hero.city || message.card.hero.regionPath || '上一目的地';
    return `[已为「${city}」生成完整行程卡（含天气、${message.card.attractions.length} 条景点、出行建议）。请勿为该地名重复调用工具。]`;
  }
  if (message.progressiveCard?.hero && message.progressiveCard.attractions) {
    const city =
      message.progressiveCard.hero.city || message.progressiveCard.hero.regionPath || '上一目的地';
    return `[已为「${city}」生成完整行程卡（含天气、${message.progressiveCard.attractions.length} 条景点、出行建议）。请勿为该地名重复调用工具。]`;
  }
  if (message.itinerary) {
    const title = message.itinerary.title || '上一目的地';
    return `[已为「${title}」生成行程规划（${message.itinerary.days.length} 天逐日路线）。请勿为该行程重复调用工具。]`;
  }
  if (message.transport) {
    const summary = message.transport.summary || message.transport.title || '上一行程';
    return `[已为「${summary}」生成交通规划（${message.transport.segments.length} 个出行方案）。请勿为该路线重复调用工具。]`;
  }
  if (message.food) {
    const region = message.food.region || message.food.title || '上一目的地';
    return `[已为「${region}」生成美食建议（${message.food.items.length} 条推荐）。请勿为该地名重复调用工具。]`;
  }
  if (message.weather || message.attractions) {
    const city = message.weather?.location ?? '上一目的地';
    return `[已查询「${city}」的天气和景点。请勿重复调用相同工具。]`;
  }
  return message.content;
}

/**
 * 将 UI 消息转换为服务端需要的历史消息结构（已完成回合会被合成可读摘要）。
 * @param messages 当前完整的 UI 消息列表
 */
export function toHistory(messages: TravelChatMessage[]): ChatMessage[] {
  return messages.map((message, index) => ({
    role: message.role,
    content: summarizeAssistantTurn(message),
    id: message.id,
    createdAt: Date.now() + index,
  }));
}
