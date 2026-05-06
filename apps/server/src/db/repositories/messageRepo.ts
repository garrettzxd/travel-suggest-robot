// messages 表数据访问层。负责 INSERT user/assistant 消息、按对话读取历史、序列化卡片字段。
import { asc, eq, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import type {
  ChatMessage,
  ChatMessageWithCards,
  FoodRecommendation,
  Itinerary,
  TransportPlan,
  TripCard,
} from "@travel/shared";
import { db } from "../client.js";
import { messages, type MessageRow } from "../schema.js";

/** 一条 assistant 消息可能携带的结构化卡片字段，全部可选。 */
export interface AssistantArtifacts {
  card?: TripCard | null;
  itinerary?: Itinerary | null;
  transport?: TransportPlan | null;
  food?: FoodRecommendation | null;
}

/** 行 → 对外类型（仅 role/content 维度），LangGraph 历史装载使用。 */
export function toChatMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    createdAt: row.createdAt,
  };
}

/** 行 → 含卡片的对外类型（详情接口使用）。卡片列做 JSON.parse；解析失败返回 undefined 不抛错。 */
export function toChatMessageWithCards(row: MessageRow): ChatMessageWithCards {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    createdAt: row.createdAt,
    card: parseJson<TripCard>(row.card),
    itinerary: parseJson<Itinerary>(row.itinerary),
    transport: parseJson<TransportPlan>(row.transport),
    food: parseJson<FoodRecommendation>(row.food),
  };
}

/** 安全的 JSON.parse：null / 空串 / 非法 JSON 都返回 undefined，不让单条坏数据拖垮整个请求。 */
function parseJson<T>(raw: string | null | undefined): T | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

/** 插入 user 消息（无卡片字段）。返回新行。 */
export async function insertUserMessage(input: {
  conversationId: string;
  content: string;
}): Promise<MessageRow> {
  const row: MessageRow = {
    id: nanoid(),
    conversationId: input.conversationId,
    role: "user",
    content: input.content,
    card: null,
    itinerary: null,
    transport: null,
    food: null,
    createdAt: Date.now(),
  };
  await db.insert(messages).values(row);
  return row;
}

/**
 * 插入 assistant 消息。
 * 卡片字段做 JSON.stringify 后写 TEXT 列；null / undefined 统一存 null，便于详情接口直接 toChatMessageWithCards。
 */
export async function insertAssistantMessage(input: {
  conversationId: string;
  content: string;
  artifacts?: AssistantArtifacts;
}): Promise<MessageRow> {
  const a = input.artifacts ?? {};
  const row: MessageRow = {
    id: nanoid(),
    conversationId: input.conversationId,
    role: "assistant",
    content: input.content,
    card: a.card ? JSON.stringify(a.card) : null,
    itinerary: a.itinerary ? JSON.stringify(a.itinerary) : null,
    transport: a.transport ? JSON.stringify(a.transport) : null,
    food: a.food ? JSON.stringify(a.food) : null,
    createdAt: Date.now(),
  };
  await db.insert(messages).values(row);
  return row;
}

/** 列出指定对话的全部消息，按时间正序。详情接口与 LangGraph history 装载共用。 */
export async function listMessagesByConversation(
  conversationId: string,
): Promise<MessageRow[]> {
  return db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt));
}

/** 取一条对话的最后一条消息（用于列表项 lastMessagePreview）。 */
export async function findLastMessage(
  conversationId: string,
): Promise<MessageRow | undefined> {
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(1);
  return rows[0];
}
