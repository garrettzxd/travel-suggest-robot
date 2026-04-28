import type { Middleware } from "koa";

const MAX_MESSAGE_LENGTH = 5000;
const MAX_HISTORY_LENGTH = 100;
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

function sanitizeText(value: string): string {
  return value.replace(CONTROL_CHARS, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 安全拦截中间件：清洗控制字符，并在 Zod 解析前快速拒绝明显超限输入。
 * 挂在 bodyParser 之后、路由之前，让下游只处理已经规整过的 request body。
 */
export const inputSecurityMiddleware: Middleware = async (ctx, next) => {
  const body = ctx.request.body;
  if (!isRecord(body)) {
    await next();
    return;
  }

  if (typeof body.message === "string") {
    const message = sanitizeText(body.message);
    if (message.length > MAX_MESSAGE_LENGTH) {
      ctx.status = 400;
      ctx.body = { message: `message must be at most ${MAX_MESSAGE_LENGTH} characters` };
      return;
    }
    body.message = message;
  }

  if (Array.isArray(body.history)) {
    if (body.history.length > MAX_HISTORY_LENGTH) {
      ctx.status = 400;
      ctx.body = { message: `history must contain at most ${MAX_HISTORY_LENGTH} messages` };
      return;
    }

    for (const entry of body.history) {
      if (isRecord(entry) && typeof entry.content === "string") {
        entry.content = sanitizeText(entry.content);
      }
    }
  }

  await next();
};
