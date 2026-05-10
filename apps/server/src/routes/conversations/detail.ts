// GET /api/conversations/:id —— 取对话详情，含按时间正序的全部消息（卡片字段已反序列化）。
import type { Context } from "koa";
import type { ConversationDetailResponse } from "@travel/shared";
import {
  findOwnedConversation,
  toConversation,
} from "../../db/repositories/conversationRepo.js";
import {
  listMessagesByConversation,
  toChatMessageWithCards,
} from "../../db/repositories/messageRepo.js";
import { badRequest, notFound, sendSuccess } from "../../utils/apiResponse.js";

/** 详情路由处理器。归属权失败统一 404，避免泄露 id 是否存在。 */
export async function detailConversationRoute(ctx: Context): Promise<void> {
  const userId = ctx.state.userId!;
  const id = ctx.params.id;

  if (typeof id !== "string" || id.length === 0) {
    throw badRequest("Missing conversation id");
  }

  const conv = await findOwnedConversation(userId, id);
  if (!conv) {
    throw notFound("Conversation not found");
  }

  const rows = await listMessagesByConversation(id);
  const body: ConversationDetailResponse = {
    conversation: toConversation(conv),
    messages: rows.map(toChatMessageWithCards),
  };
  sendSuccess(ctx, body);
}
