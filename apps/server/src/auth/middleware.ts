// Koa 鉴权中间件。
// 从 httpOnly Cookie 取 JWT，验签后把 userId / userEmail 注入 ctx.state，供后续 handler 使用。
// 失败时直接 401，不抛错给外层（避免污染日志）。
import type { Context, Next } from "koa";
import { env } from "../env.js";
import { InvalidAuthTokenError, verifyAuthToken } from "./jwt.js";

/** 把 Koa ctx.state 类型扩展，便于业务 handler 直接 ctx.state.userId 取值。 */
declare module "koa" {
  interface DefaultState {
    userId?: string;
    userEmail?: string;
  }
}

/**
 * 鉴权中间件。挂在需要登录的路由前。
 * 成功：注入 ctx.state.userId / ctx.state.userEmail，调用 next。
 * 失败：401 + JSON 错误体。
 */
export async function authRequired(ctx: Context, next: Next): Promise<void> {
  const token = ctx.cookies.get(env.COOKIE_NAME);
  if (!token) {
    ctx.status = 401;
    ctx.body = { message: "Unauthorized: missing token" };
    return;
  }

  try {
    const { userId, email } = await verifyAuthToken(token);
    ctx.state.userId = userId;
    ctx.state.userEmail = email;
    await next();
  } catch (err) {
    if (err instanceof InvalidAuthTokenError) {
      ctx.status = 401;
      ctx.body = { message: "Unauthorized: invalid token" };
      return;
    }
    throw err;
  }
}
