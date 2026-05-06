// DELETE /api/conversations/:id —— 软依赖 schema cascade 自动删 messages。
import type { Context } from "koa";
import {
  deleteConversation,
  findOwnedConversation,
} from "../../db/repositories/conversationRepo.js";

/** 删对话路由处理器。 */
export async function deleteConversationRoute(ctx: Context): Promise<void> {
  const userId = ctx.state.userId!;
  const id = ctx.params.id;

  if (typeof id !== "string" || id.length === 0) {
    ctx.status = 400;
    ctx.body = { message: "Missing conversation id" };
    return;
  }

  const conv = await findOwnedConversation(userId, id);
  if (!conv) {
    ctx.status = 404;
    ctx.body = { message: "Conversation not found" };
    return;
  }

  await deleteConversation(id);
  ctx.status = 204;
}
