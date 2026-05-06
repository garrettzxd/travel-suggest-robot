// conversations 表数据访问层。
// 全部查询都强制 userId 过滤——业务层不再需要手写归属权 WHERE，repo 是唯一安全边界。
import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { Conversation } from "@travel/shared";
import { db } from "../client.js";
import { conversations, type ConversationRow } from "../schema.js";

/** 行 → 对外的 Conversation（与 shared 类型对齐）。 */
export function toConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** 默认 title 截断长度：与 plans 中 30 字一致。 */
const TITLE_MAX = 30;

/** 把首条 user message 截断为 title，去除多余空白；超长追加省略号。 */
export function deriveTitle(message: string): string {
  const trimmed = message.replace(/\s+/g, " ").trim();
  return trimmed.length > TITLE_MAX ? `${trimmed.slice(0, TITLE_MAX)}…` : trimmed || "新的对话";
}

/** 创建新对话。title 不传则用占位「新的对话」。 */
export async function createConversation(input: {
  userId: string;
  title?: string;
}): Promise<ConversationRow> {
  const now = Date.now();
  const row: ConversationRow = {
    id: nanoid(),
    userId: input.userId,
    title: input.title?.trim() || "新的对话",
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(conversations).values(row);
  return row;
}

/**
 * 按归属权查询单个对话。
 * 找不到 / 不属于该用户都返回 undefined——上层统一映射为 404，不暴露归属信息。
 */
export async function findOwnedConversation(
  userId: string,
  conversationId: string,
): Promise<ConversationRow | undefined> {
  const rows = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
    .limit(1);
  return rows[0];
}

/** 列出某用户最近 N 条对话，按 updatedAt 倒序。MVP 阶段固定 20 条。 */
export async function listRecentConversations(
  userId: string,
  limit = 20,
): Promise<ConversationRow[]> {
  return db
    .select()
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.updatedAt))
    .limit(limit);
}

/** 刷新对话的 updatedAt 时间戳——每次新增消息后调用，列表才能保持最近活跃排序。 */
export async function touchConversation(conversationId: string): Promise<void> {
  await db
    .update(conversations)
    .set({ updatedAt: Date.now() })
    .where(eq(conversations.id, conversationId));
}

/**
 * 删除对话（连带 cascade 删消息）。
 * 仅在归属权确认后才放行——上层先查 findOwnedConversation 拿到 row 再调本函数。
 */
export async function deleteConversation(conversationId: string): Promise<void> {
  await db.delete(conversations).where(eq(conversations.id, conversationId));
}
