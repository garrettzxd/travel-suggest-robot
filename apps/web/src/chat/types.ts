import type {
  Attraction,
  FoodRecommendation,
  Itinerary,
  ProgressiveTripCard,
  ToolName,
  TransportPlan,
  TripCard,
  WeatherSnapshot,
} from '@travel/shared';

/**
 * 单次 tool 调用的轨迹（保留为 fallback / 调试入口，TripCardView 不再依赖它）。
 * - running：tool_start 已下发，等待结果；
 * - done：收到 tool_end，result 已落入；
 * - error：流异常或显式 error 事件后被刷成 error 终态。
 */
export interface ToolTraceEntry {
  name: ToolName;
  status: 'running' | 'done' | 'error';
  args?: unknown;
  result?: unknown;
}

/**
 * 单条聊天消息。
 * - assistant 消息可携带 weather / attractions / progressiveCard / card / itinerary /
 *   transport / food 七类结构化数据，ChatPage 据此决定渲染哪种卡片或降级到 MarkdownTyping。
 * - hasToolStart 标记本轮是否已收到任一 tool_start：用于区分"闲聊（无工具）"与"卡片流"，
 *   闲聊场景仍走 markdown bubble，不渲染卡片骨架。
 * - toolsStarted 累积本轮所有 tool_start 的工具名（仅 getWeather / getAttractions 会真的下发），
 *   TripCardView 据此决定是否为对应槽位预留骨架。
 * - textRenderMode 区分 assistant 文本展示方式：当前对话流式输出，历史对话直接静态展示。
 *
 * 新增结构化卡片时，按这里加新槽 → eventHandlers.ts 加事件 → ChatPage 选择渲染分支。
 */
export interface TravelChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt?: number;
  status?: 'local' | 'loading' | 'updating' | 'success' | 'error' | 'abort';
  textRenderMode?: 'stream' | 'static';
  weather?: WeatherSnapshot;
  attractions?: Attraction[];
  progressiveCard?: ProgressiveTripCard;
  card?: TripCard;
  itinerary?: Itinerary;
  /** 交通规划卡（预留）：由 SSE `transport` 事件填入。 */
  transport?: TransportPlan;
  /** 美食建议卡（预留）：由 SSE `food` 事件填入。 */
  food?: FoodRecommendation;
  hasToolStart?: boolean;
  toolsStarted?: ToolName[];
}
