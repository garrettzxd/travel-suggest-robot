import type { Itinerary, TripCard } from './travel.js';

/** 单条聊天消息 */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  id: string;
  createdAt: number;
}

/** POST /api/chat 请求体 */
export interface ChatRequest {
  message: string;
  history: ChatMessage[];
}

/**
 * 工具名枚举。
 * - getWeather / getAttractions：外部业务工具，结果通过 tool_start / tool_end 下发给前端；
 * - finalizeTripCard / recommendItinerary：内部工具，由 chat 路由消费后合并成结构化卡片事件，
 *   **不会**以 tool_start / tool_end 形式下发。
 *   保留在 ToolName 里便于类型提示，但前端不应收到它的 tool 事件。
 */
export type ToolName =
  | 'getWeather'
  | 'getAttractions'
  | 'finalizeTripCard'
  | 'recommendItinerary';

/**
 * SSE 下行事件。
 * - token：LLM token 增量；
 * - tool_start / tool_end：仅 getWeather / getAttractions 两个对外工具；
 * - card：由 finalizeTripCard 合并出的完整 TripCard，前端据此渲染复合卡；
 * - itinerary：由 recommendItinerary 产出的完整 Itinerary，前端据此渲染行程规划卡；
 * - final：LLM 最终文本（通常在开启 TripCard 流程时为空）；
 * - error / done：终态。
 */
export type StreamEvent =
  | { type: 'token'; delta: string }
  | { type: 'tool_start'; name: ToolName; args: unknown }
  | { type: 'tool_end'; name: ToolName; result: unknown }
  | { type: 'card'; card: TripCard }
  | { type: 'itinerary'; itinerary: Itinerary }
  | { type: 'final'; content: string }
  | { type: 'error'; message: string }
  | { type: 'done' };
