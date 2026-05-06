import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type {
  Attraction,
  FoodRecommendation,
  Itinerary,
  ToolName,
  TransportPlan,
  TripCard,
  WeatherSnapshot,
} from '@travel/shared';
import type { ToolTraceEntry, TravelChatMessage } from '../types';
import {
  patchAssistantMessage,
  patchProgressiveCard,
} from '../message/patch';
import {
  markRunningToolsAsError,
  markToolDone,
  normalizeAttractionsResult,
} from '../tool/trace';

/**
 * 事件处理器拿到的上下文。
 * - tokenBuffer 是 ref 容器，token 处理器需在多次 frame 间累加 delta；
 * - 其它 setter 直接驱动 useTravelAgent 内的 state。
 */
export interface SseHandlerContext {
  assistantMessageId: string;
  tokenBuffer: MutableRefObject<string>;
  setMessages: Dispatch<SetStateAction<TravelChatMessage[]>>;
  setToolTrace: Dispatch<SetStateAction<ToolTraceEntry[]>>;
}

/**
 * 单个 SSE 事件处理器签名。
 * 返回 'stop' 表示主循环应立即停止消费（如 error 事件）；
 * 返回 void / undefined 表示继续。
 */
export type SseEventHandler = (data: unknown, ctx: SseHandlerContext) => 'stop' | void;

/**
 * token：累加 delta 并刷写 content。
 * tokenBuffer 用 ref 跨 frame 累加，避免每次都 setMessages(prev => ...) 读旧值导致丢字。
 */
const handleToken: SseEventHandler = (data, ctx) => {
  const delta = (data as { delta?: string }).delta ?? '';
  ctx.tokenBuffer.current += delta;
  const next = ctx.tokenBuffer.current;
  ctx.setMessages((prev) =>
    patchAssistantMessage(prev, ctx.assistantMessageId, {
      content: next,
      status: 'updating',
    }),
  );
};

/**
 * tool_start：在 trace 上追加 running 项；标记本轮已进入"卡片流"，并把工具名累加到
 * toolsStarted 上让 TripCardView 决定渲染哪些骨架槽。
 */
const handleToolStart: SseEventHandler = (data, ctx) => {
  const payload = data as { name: ToolName; args: unknown };
  ctx.setToolTrace((prev) => [
    ...prev,
    { name: payload.name, status: 'running', args: payload.args },
  ]);
  ctx.setMessages((prev) =>
    prev.map((entry) => {
      if (entry.id !== ctx.assistantMessageId || entry.role !== 'assistant') return entry;
      const prevTools = entry.toolsStarted ?? [];
      const toolsStarted = prevTools.includes(payload.name)
        ? prevTools
        : [...prevTools, payload.name];
      return {
        ...entry,
        hasToolStart: true,
        toolsStarted,
        status: 'updating',
      };
    }),
  );
};

/**
 * tool_end：标记 trace 完成，并把 getWeather / getAttractions 的裸数据落到当前消息上，
 * TripCardView 据此把对应子卡从骨架升级为裸数据态。
 */
const handleToolEnd: SseEventHandler = (data, ctx) => {
  const payload = data as { name: ToolName; result: unknown };
  ctx.setToolTrace((prev) => markToolDone(prev, payload));

  if (payload.name === 'getWeather' && payload.result && typeof payload.result === 'object') {
    ctx.setMessages((prev) =>
      patchAssistantMessage(prev, ctx.assistantMessageId, {
        weather: payload.result as WeatherSnapshot,
      }),
    );
    return;
  }

  if (payload.name === 'getAttractions') {
    const items = normalizeAttractionsResult(payload.result);
    if (items) {
      ctx.setMessages((prev) =>
        patchAssistantMessage(prev, ctx.assistantMessageId, { attractions: items }),
      );
    }
  }
};

/** card：finalizeTripCard 合并出的完整 TripCard，一次性落入。 */
const handleCard: SseEventHandler = (data, ctx) => {
  const card = (data as { card?: TripCard }).card;
  if (!card) return;
  ctx.setMessages((prev) => patchAssistantMessage(prev, ctx.assistantMessageId, { card }));
};

/** card_destination：渐进式 hero 局部数据，patchProgressiveCard 会在字段齐备时合成 card。 */
const handleCardDestination: SseEventHandler = (data, ctx) => {
  const hero = (data as { hero?: TripCard['hero'] }).hero;
  if (!hero) return;
  ctx.setMessages((prev) => patchProgressiveCard(prev, ctx.assistantMessageId, { hero }));
};

/** card_weather：渐进式天气块（含 summary）。 */
const handleCardWeather: SseEventHandler = (data, ctx) => {
  const weather = (data as { weather?: WeatherSnapshot & { summary: string } }).weather;
  if (!weather) return;
  ctx.setMessages((prev) => patchProgressiveCard(prev, ctx.assistantMessageId, { weather }));
};

/** card_attractions_summary：渐进式景点 + 出行建议 + 后续追问 chips（一次到达）。 */
const handleCardAttractionsSummary: SseEventHandler = (data, ctx) => {
  const payload = data as {
    attractions?: Attraction[];
    recommendation?: TripCard['recommendation'];
    chips?: string[];
  };
  if (!payload.attractions || !payload.recommendation || !payload.chips) return;
  ctx.setMessages((prev) =>
    patchProgressiveCard(prev, ctx.assistantMessageId, {
      attractions: payload.attractions,
      recommendation: payload.recommendation,
      chips: payload.chips,
    }),
  );
};

/** itinerary：完整行程规划卡。 */
const handleItinerary: SseEventHandler = (data, ctx) => {
  const itinerary = (data as { itinerary?: Itinerary }).itinerary;
  if (!itinerary) return;
  ctx.setMessages((prev) =>
    patchAssistantMessage(prev, ctx.assistantMessageId, { itinerary }),
  );
};

/**
 * transport：完整交通规划卡（预留）。
 * 后端打通 recommendTransport 工具后，无需改动主循环即可生效。
 */
const handleTransport: SseEventHandler = (data, ctx) => {
  const transport = (data as { transport?: TransportPlan }).transport;
  if (!transport) return;
  ctx.setMessages((prev) =>
    patchAssistantMessage(prev, ctx.assistantMessageId, { transport }),
  );
};

/**
 * food：完整美食建议卡（预留）。
 * 后端打通 recommendFood 工具后，无需改动主循环即可生效。
 */
const handleFood: SseEventHandler = (data, ctx) => {
  const food = (data as { food?: FoodRecommendation }).food;
  if (!food) return;
  ctx.setMessages((prev) =>
    patchAssistantMessage(prev, ctx.assistantMessageId, { food }),
  );
};

/**
 * final：LLM 最终文本到达。把 tokenBuffer 修正为 final.content（覆盖累计的 delta），
 * 并把 status 切到 success。
 */
const handleFinal: SseEventHandler = (data, ctx) => {
  const content = (data as { content?: string }).content ?? ctx.tokenBuffer.current;
  ctx.tokenBuffer.current = content;
  ctx.setMessages((prev) =>
    patchAssistantMessage(prev, ctx.assistantMessageId, {
      content,
      status: 'success',
    }),
  );
};

/** error：把 running 工具刷成 error，写出错误文案并要求主循环停止消费。 */
const handleError: SseEventHandler = (data, ctx) => {
  const errorMessage =
    (data as { message?: string }).message ?? '服务暂时不可用，请稍后再试。';
  ctx.setToolTrace((prev) => markRunningToolsAsError(prev));
  ctx.setMessages((prev) =>
    patchAssistantMessage(prev, ctx.assistantMessageId, {
      content: `请求失败：${errorMessage}`,
      status: 'error',
    }),
  );
  return 'stop';
};

/**
 * SSE 事件处理器注册表。
 *
 * 扩展指南（新增结构化卡片）：
 * 1. 在 packages/shared/src/travel.ts 加领域类型；
 * 2. 在 packages/shared/src/chat.ts 的 StreamEvent 加事件 + ToolName（如适用）；
 * 3. 在 chat/types.ts 的 TravelChatMessage 加新槽位；
 * 4. 在本文件加一个 handleXxx 并注册进下表；
 * 5. 在 chat/message/history.ts 的 summarizeAssistantTurn 加历史摘要分支；
 * 6. 在 ChatPage MessageRow 选择渲染分支即可。
 *
 * 主循环（useTravelAgent）零修改。`done` 事件由主循环直接消费用于跳出，不在此注册。
 */
export const sseEventHandlers: Record<string, SseEventHandler> = {
  token: handleToken,
  tool_start: handleToolStart,
  tool_end: handleToolEnd,
  card: handleCard,
  card_destination: handleCardDestination,
  card_weather: handleCardWeather,
  card_attractions_summary: handleCardAttractionsSummary,
  itinerary: handleItinerary,
  transport: handleTransport,
  food: handleFood,
  final: handleFinal,
  error: handleError,
};
