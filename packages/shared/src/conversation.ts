// 对话历史模块共享类型：会话本身、列表项、详情响应。
// 详情中的 messages 用 ChatMessageWithCards——在 ChatMessage 基础上扩展卡片字段，
// 让前端拿到历史消息后可直接渲染 TripCard / Itinerary，无需二次接口。
import type { ChatMessage } from "./chat.js";
import type {
  FoodRecommendation,
  Itinerary,
  TransportPlan,
  TripCard,
} from "./travel.js";

/** 对话会话核心字段，与 server `conversations` 表行结构对齐。 */
export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

/** 列表项扩展：附带最后一条消息的预览，用于侧边栏渲染。 */
export interface ConversationListItem extends Conversation {
  lastMessagePreview?: string;
}

/** GET /api/conversations 响应：固定返回最近 20 条，不分页。 */
export interface ConversationListResponse {
  items: ConversationListItem[];
}

/**
 * 详情接口返回的单条消息：在 ChatMessage 基础上挂上反序列化后的卡片对象。
 * server 端 messageRepo 负责从 TEXT 列做 JSON.parse。
 */
export interface ChatMessageWithCards extends ChatMessage {
  card?: TripCard;
  itinerary?: Itinerary;
  transport?: TransportPlan;
  food?: FoodRecommendation;
}

/** GET /api/conversations/:id 响应。 */
export interface ConversationDetailResponse {
  conversation: Conversation;
  messages: ChatMessageWithCards[];
}

/** POST /api/conversations 请求体（title 可选——不传则用占位 title）。 */
export interface CreateConversationRequest {
  title?: string;
}

/** POST /api/conversations 响应。 */
export interface CreateConversationResponse {
  conversation: Conversation;
}
