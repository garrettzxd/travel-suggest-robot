// DELETE /api/conversations/:id —— 软依赖 schema cascade 自动删 messages。
import type { Context } from "koa";
import {
  deleteConversation,
  findOwnedConversation,
} from "../../db/repositories/conversationRepo.js";
import { badRequest, notFound, sendSuccess } from "../../utils/apiResponse.js";

/** 删对话路由处理器。 */
export async function deleteConversationRoute(ctx: Context): Promise<void> {
  const userId = ctx.state.userId!;
  const id = ctx.params.id;

  if (typeof id !== "string" || id.length === 0) {
    throw badRequest("Missing conversation id");
  }

  const conv = await findOwnedConversation(userId, id);
  if (!conv) {
    throw notFound("Conversation not found");
  }

  await deleteConversation(id);
  sendSuccess(ctx, {});
}
