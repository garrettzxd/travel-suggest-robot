import { useRef, useState } from 'react';
import { STREAM_SEPARATOR, PART_SEPARATOR, KV_SEPARATOR } from '@travel/shared';
import type {
  Attraction,
  ChatMessage,
  ChatRequest,
  Itinerary,
  ProgressiveTripCard,
  ToolName,
  TripCard,
  WeatherSnapshot,
} from '@travel/shared';
import { postChat } from '../api/client';

/** 单次 tool 调用的轨迹（保留为 fallback / 调试入口，TripCardView 不再依赖它）。 */
export interface ToolTraceEntry {
  name: ToolName;
  status: 'running' | 'done' | 'error';
  args?: unknown;
  result?: unknown;
}

/**
 * 单条聊天消息。
 * - assistant 消息可携带 weather / attractions / progressiveCard / card / itinerary 五类结构化数据，
 *   ChatPage 据此决定渲染结构化卡片还是降级到 MarkdownTyping。
 * - hasToolStart 标记本轮是否已收到任一 tool_start：用于区分"闲聊（无工具）"与"卡片流"，
 *   闲聊场景仍走 markdown bubble，不渲染卡片骨架。
 * - toolsStarted 累积本轮所有 tool_start 的工具名（仅 getWeather / getAttractions 会真的下发），
 *   TripCardView 据此决定是否为对应槽位预留骨架，避免"只查天气也展示空地点/景点/出行建议"。
 */
export interface TravelChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status?: 'local' | 'loading' | 'updating' | 'success' | 'error' | 'abort';
  weather?: WeatherSnapshot;
  attractions?: Attraction[];
  progressiveCard?: ProgressiveTripCard;
  card?: TripCard;
  itinerary?: Itinerary;
  hasToolStart?: boolean;
  toolsStarted?: ToolName[];
}

/** 解析单个 SSE frame，兼容多行 data 字段并在 JSON 解析失败时保留原文。 */
function parseFrame(frame: string): { event: string; data: unknown } | null {
  let event: string | undefined;
  let rawData = '';
  for (const line of frame.split(PART_SEPARATOR)) {
    const sepIdx = line.indexOf(KV_SEPARATOR);
    if (sepIdx === -1) continue;
    const field = line.slice(0, sepIdx).trim();
    const value = line.slice(sepIdx + 1).replace(/^ /, '');
    if (field === 'event') event = value;
    else if (field === 'data') rawData = rawData ? `${rawData}\n${value}` : value;
  }
  if (!event) return null;
  try {
    return { event, data: rawData ? JSON.parse(rawData) : {} };
  } catch {
    return { event, data: rawData };
  }
}

/** 持续读取响应流，按 SSE 分隔符切分并逐个产出事件帧。 */
async function* readSseFrames(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        if (buffer.trim()) {
          const parsed = parseFrame(buffer);
          if (parsed) yield parsed;
        }
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      let idx = buffer.indexOf(STREAM_SEPARATOR);
      while (idx !== -1) {
        // buffer 可能一次包含多个 SSE frame，需要循环消费到剩余不完整片段。
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + STREAM_SEPARATOR.length);
        const parsed = parseFrame(frame);
        if (parsed) yield parsed;
        idx = buffer.indexOf(STREAM_SEPARATOR);
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * 给已经渲染过 TripCard 的 assistant 历史回合合成一条"已完成"摘要。
 * - prompt 让 LLM 调完 TripCard 内部工具链后空字符串收尾，导致 history 里 content="";
 *   下游 LLM 看到空 assistant 回合会误以为上一轮没完成，对历史地名重复调工具。
 * - 这里把空 content + 有结构化数据的 assistant 消息替换成 "[已为「xxx」生成行程卡...]"，
 *   让模型清楚那一轮已收口，新一轮只需处理当前用户消息。
 */
function summarizeAssistantTurn(message: TravelChatMessage): string {
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
  if (message.weather || message.attractions) {
    const city = message.weather?.location ?? '上一目的地';
    return `[已查询「${city}」的天气和景点。请勿重复调用相同工具。]`;
  }
  return message.content;
}

/** 将 UI 消息转换为服务端需要的历史消息结构（已完成回合会被合成可读摘要）。 */
function toHistory(messages: TravelChatMessage[]): ChatMessage[] {
  return messages.map((message, index) => ({
    role: message.role,
    content: summarizeAssistantTurn(message),
    id: message.id,
    createdAt: Date.now() + index,
  }));
}

/** 将最近一个同名运行中工具标记为完成，找不到时补一条完成记录。 */
function markToolDone(entries: ToolTraceEntry[], payload: { name: ToolName; result: unknown }) {
  const next = [...entries];
  // 从后往前匹配，避免并行工具或重复工具名时更新到更早的调用记录。
  for (let index = next.length - 1; index >= 0; index -= 1) {
    const entry = next[index];
    if (entry?.name === payload.name && entry.status === 'running') {
      next[index] = { ...entry, status: 'done', result: payload.result };
      return next;
    }
  }
  next.push({ name: payload.name, status: 'done', result: payload.result });
  return next;
}

/** 把 getAttractions 工具结果（可能是 JSON 字符串或已反序列化数组）归一成 Attraction[]。 */
function normalizeAttractionsResult(result: unknown): Attraction[] | undefined {
  if (Array.isArray(result)) return result as Attraction[];
  if (typeof result === 'string') {
    try {
      const parsed = JSON.parse(result);
      if (Array.isArray(parsed)) return parsed as Attraction[];
    } catch {
      // 忽略：解析失败按未拿到结构化数据处理。
    }
  }
  return undefined;
}

/**
 * 通用 patch 助手：找到 id 匹配的 assistant 消息并应用 patch；
 * 不存在或非 assistant 时原数组返回，避免误伤 user 气泡。
 */
function patchAssistantMessage(
  messages: TravelChatMessage[],
  id: string,
  patch: Partial<TravelChatMessage>,
): TravelChatMessage[] {
  return messages.map((entry) =>
    entry.id === id && entry.role === 'assistant' ? { ...entry, ...patch } : entry,
  );
}

/** 渐进式 TripCard 数据齐备后合成旧 TripCard，保持历史摘要与旧渲染路径兼容。 */
function tryBuildCardFromProgressive(progressiveCard: ProgressiveTripCard): TripCard | undefined {
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

/** 对当前 assistant 消息做局部 TripCard patch，并在可能时同步合成完整 card。 */
function patchProgressiveCard(
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

/**
 * useTravelAgent：封装聊天请求、SSE 消费、消息状态、工具进度，以及 PRD §7 引入的
 * 结构化数据（weather / attractions / progressiveCard / card / itinerary）。
 * 返回的 messages 直接给 ChatPage 渲染。
 */
export function useTravelAgent() {
  const [messages, setMessages] = useState<TravelChatMessage[]>([]);
  const [toolTrace, setToolTrace] = useState<ToolTraceEntry[]>([]);
  const [isRequesting, setIsRequesting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  /**
   * 发送用户输入并把服务端 SSE 事件增量合并到当前 assistant 消息。
   * 每个 tool_end / card_* 事件都会就地 patch assistant 消息，使 ChatPage 能根据数据可用性
   * 决定 TripCardView 各子卡的骨架/裸数据/完整态。
   */
  async function onRequest(input: string) {
    const message = input.trim();
    if (!message) return;

    // 新请求会中止上一个仍在进行的请求，避免旧流继续写入界面。
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const baseMessages = messages;
    const userMessage: TravelChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: message,
      status: 'local',
    };
    const assistantMessageId = `assistant-${Date.now()}`;

    setMessages((prev) => [
      ...prev,
      userMessage,
      { id: assistantMessageId, role: 'assistant', content: '', status: 'loading' },
    ]);
    setToolTrace([]);
    setIsRequesting(true);

    const body: ChatRequest = { message, history: toHistory(baseMessages) };
    let accumulated = '';

    try {
      const stream = await postChat(body, controller.signal);

      for await (const { event, data } of readSseFrames(stream)) {
        if (event === 'token') {
          const delta = (data as { delta?: string }).delta ?? '';
          accumulated += delta;
          setMessages((prev) =>
            patchAssistantMessage(prev, assistantMessageId, {
              content: accumulated,
              status: 'updating',
            }),
          );
          continue;
        }

        if (event === 'tool_start') {
          const payload = data as { name: ToolName; args: unknown };
          setToolTrace((prev) => [
            ...prev,
            { name: payload.name, status: 'running', args: payload.args },
          ]);
          // tool_start 标记 → ChatPage 据此判断切换到卡片流（PRD §7.5）；
          // toolsStarted 同时累加工具名，TripCardView 用它裁剪槽位渲染。
          setMessages((prev) =>
            prev.map((entry) => {
              if (entry.id !== assistantMessageId || entry.role !== 'assistant') return entry;
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
          continue;
        }

        if (event === 'tool_end') {
          const payload = data as { name: ToolName; result: unknown };
          setToolTrace((prev) => markToolDone(prev, payload));
          // 把裸数据落到当前 assistant 消息上，TripCardView 即时升级对应子卡。
          if (payload.name === 'getWeather' && payload.result && typeof payload.result === 'object') {
            setMessages((prev) =>
              patchAssistantMessage(prev, assistantMessageId, {
                weather: payload.result as WeatherSnapshot,
              }),
            );
          } else if (payload.name === 'getAttractions') {
            const items = normalizeAttractionsResult(payload.result);
            if (items) {
              setMessages((prev) =>
                patchAssistantMessage(prev, assistantMessageId, {
                  attractions: items,
                }),
              );
            }
          }
          continue;
        }

        if (event === 'card') {
          const card = (data as { card?: TripCard }).card;
          if (card) {
            setMessages((prev) =>
              patchAssistantMessage(prev, assistantMessageId, { card }),
            );
          }
          continue;
        }

        if (event === 'card_destination') {
          const hero = (data as { hero?: TripCard['hero'] }).hero;
          if (hero) {
            setMessages((prev) => patchProgressiveCard(prev, assistantMessageId, { hero }));
          }
          continue;
        }

        if (event === 'card_weather') {
          const weather = (data as { weather?: WeatherSnapshot & { summary: string } }).weather;
          if (weather) {
            setMessages((prev) =>
              patchProgressiveCard(prev, assistantMessageId, { weather }),
            );
          }
          continue;
        }

        if (event === 'card_attractions_summary') {
          const payload = data as {
            attractions?: Attraction[];
            recommendation?: TripCard['recommendation'];
            chips?: string[];
          };
          if (payload.attractions && payload.recommendation && payload.chips) {
            setMessages((prev) =>
              patchProgressiveCard(prev, assistantMessageId, {
                attractions: payload.attractions,
                recommendation: payload.recommendation,
                chips: payload.chips,
              }),
            );
          }
          continue;
        }

        if (event === 'itinerary') {
          const itinerary = (data as { itinerary?: Itinerary }).itinerary;
          if (itinerary) {
            setMessages((prev) =>
              patchAssistantMessage(prev, assistantMessageId, { itinerary }),
            );
          }
          continue;
        }

        if (event === 'final') {
          accumulated = (data as { content?: string }).content ?? accumulated;
          setMessages((prev) =>
            patchAssistantMessage(prev, assistantMessageId, {
              content: accumulated,
              status: 'success',
            }),
          );
          continue;
        }

        if (event === 'error') {
          const errorMessage =
            (data as { message?: string }).message ?? '服务暂时不可用，请稍后再试。';
          setToolTrace((prev) =>
            prev.map((entry) =>
              entry.status === 'running' ? { ...entry, status: 'error' } : entry,
            ),
          );
          setMessages((prev) =>
            patchAssistantMessage(prev, assistantMessageId, {
              content: `请求失败：${errorMessage}`,
              status: 'error',
            }),
          );
          return;
        }

        if (event === 'done') break;
      }
    } catch (error) {
      if ((error as { name?: string }).name !== 'AbortError') {
        const messageText = error instanceof Error ? error.message : String(error);
        setToolTrace((prev) =>
          prev.map((entry) =>
            entry.status === 'running' ? { ...entry, status: 'error' } : entry,
          ),
        );
        setMessages((prev) =>
          patchAssistantMessage(prev, assistantMessageId, {
            content: `请求失败：${messageText}`,
            status: 'error',
          }),
        );
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setIsRequesting(false);
      }
    }
  }

  return { messages, onRequest, toolTrace, isRequesting };
}
