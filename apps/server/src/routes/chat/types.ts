// chat 路由的 Zod 校验 schema、跨模块共享类型、以及单轮请求的可变状态结构。
// 拆分自原 routes/chat.types.ts + chat.ts 顶部的 LangChainStreamEvent 接口。
import { z } from "zod";
import type { Attraction, ToolName, TripCard, WeatherSnapshot } from "@travel/shared";

/** POST /api/chat 的请求体。history 允许缺省为空数组，避免首轮对话被挡。 */
export const ChatRequestSchema = z.object({
  message: z.string().min(1),
  history: z
    .array(
      z.object({
        id: z.string().min(1),
        role: z.enum(["user", "assistant"]),
        content: z.string(),
        createdAt: z.number(),
      }),
    )
    .default([]),
});

// LangGraph 流式 message chunk 附带的元信息，langgraph_node 标识产出该 chunk 的节点。
// createAgent 当前模型节点通常是 "model_request"，不能写死只接受 "model"。
export interface StreamMetadata {
  langgraph_node?: string;
}

// 大模型要求调用工具时的单条 tool_call 结构。
export interface ToolCall {
  id?: string;
  name?: string;
  args?: unknown;
}

/** SSE 帧写入函数签名：handlers 通过它向前端推送事件。 */
export type EventWriter = (
  event: string,
  data: unknown,
  extra?: Record<string, unknown>,
) => void;

/** LangGraph `streamEvents({ version: "v2" })` 每个产出的事件形态。 */
export interface LangChainStreamEvent {
  event: string;
  name: string;
  run_id: string;
  data?: {
    input?: unknown;
    output?: unknown;
    chunk?: unknown;
    error?: string;
  };
  metadata?: Record<string, unknown>;
}

/**
 * 单轮请求内 handlers 共享的可变状态。
 * 收口原 chatRoute 闭包内散落的 Set / 标志位 / 缓存，避免传一长串参数。
 *
 * - startedToolCalls / completedToolCalls：按 run_id 去重，防 LangGraph 同事件重复推送；
 * - emittedPublicTools：单轮内同名公开工具最多 emit 一次，避免 LLM 并行调多次污染前端状态；
 * - emittedToolStartRunIds：start 阶段成功 emit 的 run_id；end 阶段以此判断是否要落 cache + emit；
 * - cardEmitted / itineraryEmitted：单轮内只允许一张结构化卡片；
 * - cachedWeather / cachedAttractions：TripCard narrative 工具收尾时合并局部卡片用；
 * - cachedHero / cachedWeatherWithSummary / cachedAttractionsWithDescriptions / cachedRecommendation / cachedChips：
 *   渐进式 TripCard 局部事件缓存，便于日志、互斥与未来兼容完整 card 合成；
 * - finalContent：累积模型输出，结束时一并以 'final' 事件下发；
 * - skippedEmptyChunkCount：模型在 tool_call 拼装期推回的空文本 chunk 计数，stream 结束统一打一行汇总；
 * - weatherOnlyShortCircuit：纯天气查询（仅触发 getWeather + finalizeTripWeather，不进 TripCard 完整流）时，
 *   card_weather 已经下发了完整的天气数据 + summary，无需再让 LLM 续写一段重复的 markdown 文本。
 *   置 true 后 route.ts 主循环会立刻 break 并 abort agent stream，直接走 final + done。
 */
export interface ChatStreamState {
  startedToolCalls: Set<string>;
  completedToolCalls: Set<string>;
  emittedPublicTools: Set<ToolName>;
  emittedToolStartRunIds: Set<string>;
  cardEmitted: boolean;
  itineraryEmitted: boolean;
  cachedWeather: WeatherSnapshot | undefined;
  cachedAttractions: Attraction[] | undefined;
  cachedHero: TripCard["hero"] | undefined;
  cachedWeatherWithSummary: (WeatherSnapshot & { summary: string }) | undefined;
  cachedAttractionsWithDescriptions: Attraction[] | undefined;
  cachedRecommendation: TripCard["recommendation"] | undefined;
  cachedChips: string[] | undefined;
  destinationEmitted: boolean;
  weatherSummaryEmitted: boolean;
  attractionsSummaryEmitted: boolean;
  finalContent: string;
  skippedEmptyChunkCount: number;
  weatherOnlyShortCircuit: boolean;
}

/** 工厂方法：单轮请求开始时创建一个全新的可变状态。 */
export function createInitialState(): ChatStreamState {
  return {
    startedToolCalls: new Set<string>(),
    completedToolCalls: new Set<string>(),
    emittedPublicTools: new Set<ToolName>(),
    emittedToolStartRunIds: new Set<string>(),
    cardEmitted: false,
    itineraryEmitted: false,
    cachedWeather: undefined,
    cachedAttractions: undefined,
    cachedHero: undefined,
    cachedWeatherWithSummary: undefined,
    cachedAttractionsWithDescriptions: undefined,
    cachedRecommendation: undefined,
    cachedChips: undefined,
    destinationEmitted: false,
    weatherSummaryEmitted: false,
    attractionsSummaryEmitted: false,
    finalContent: "",
    skippedEmptyChunkCount: 0,
    weatherOnlyShortCircuit: false,
  };
}
