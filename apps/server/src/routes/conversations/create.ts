// POST /api/conversations —— 显式创建空对话。可选——POST /api/chat 也会按需创建。
import type { Context } from "koa";
import { z } from "zod";
import type { CreateConversationResponse } from "@travel/shared";
import {
  createConversation,
  toConversation,
} from "../../db/repositories/conversationRepo.js";

const CreateSchema = z.object({
  title: z.string().min(1).max(80).optional(),
});

/** 显式建对话路由。 */
export async function createConversationRoute(ctx: Context): Promise<void> {
  const userId = ctx.state.userId!;

  const parsed = CreateSchema.safeParse(ctx.request.body ?? {});
  if (!parsed.success) {
    ctx.status = 400;
    ctx.body = {
      message: "Invalid request body",
      errors: parsed.error.flatten().fieldErrors,
    };
    return;
  }

  const row = await createConversation({ userId, title: parsed.data.title });
  ctx.status = 201;
  const body: CreateConversationResponse = { conversation: toConversation(row) };
  ctx.body = body;
}
