// GET /api/conversations —— 列出当前用户最近 20 条对话，附最后一条消息预览。
import type { Context } from "koa";
import type { ConversationListItem, ConversationListResponse } from "@travel/shared";
import {
  listRecentConversations,
  toConversation,
} from "../../db/repositories/conversationRepo.js";
import { findLastMessage } from "../../db/repositories/messageRepo.js";
import { sendSuccess } from "../../utils/apiResponse.js";

/** 截断 lastMessagePreview 的长度，避免侧边栏过长。 */
const PREVIEW_MAX = 60;

/** 列对话路由处理器。 */
export async function listConversationsRoute(ctx: Context): Promise<void> {
  const userId = ctx.state.userId!; // authRequired 已保证

  const rows = await listRecentConversations(userId, 20);

  // 为每条对话查最后一条消息——SQLite 单进程下 N+1 在 20 条规模下完全可接受。
  // 未来要优化时再改成单 SQL 子查询或物化「lastMessageId」列。
  const items: ConversationListItem[] = await Promise.all(
    rows.map(async (row) => {
      const last = await findLastMessage(row.id);
      const preview = last?.content
        ? truncate(last.content, PREVIEW_MAX)
        : undefined;
      return { ...toConversation(row), lastMessagePreview: preview };
    }),
  );

  const body: ConversationListResponse = { items };
  sendSuccess(ctx, body);
}

/** 文本截断：连续空白压一格、超长追加省略号。 */
function truncate(value: string, max: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max)}…` : normalized;
}
