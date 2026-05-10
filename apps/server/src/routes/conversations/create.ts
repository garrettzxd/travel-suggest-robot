// POST /api/conversations —— 显式创建空对话。可选——POST /api/chat 也会按需创建。
import type { Context } from "koa";
import { z } from "zod";
import type { CreateConversationResponse } from "@travel/shared";
import {
  createConversation,
  toConversation,
} from "../../db/repositories/conversationRepo.js";
import { badRequest, sendSuccess } from "../../utils/apiResponse.js";

const CreateSchema = z.object({
  title: z.string().min(1).max(80).optional(),
});

/** 显式建对话路由。 */
export async function createConversationRoute(ctx: Context): Promise<void> {
  const userId = ctx.state.userId!;

  const parsed = CreateSchema.safeParse(ctx.request.body ?? {});
  if (!parsed.success) {
    throw badRequest("Invalid request body", {
      errors: parsed.error.flatten().fieldErrors,
    });
  }

  const row = await createConversation({ userId, title: parsed.data.title });
  const body: CreateConversationResponse = { conversation: toConversation(row) };
  sendSuccess(ctx, body, 201);
}
