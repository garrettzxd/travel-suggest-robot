// POST /api/auth/logout —— 仅清 Cookie。JWT 无状态，无需 server-side 黑名单。
// 不强制要求 auth 中间件：未登录用户调 logout 也能正常返回 204。
import type { Context } from "koa";
import { clearAuthCookie } from "../../auth/cookie.js";
import { sendSuccess } from "../../utils/apiResponse.js";

/** 登出路由处理器。 */
export function logoutRoute(ctx: Context): void {
  clearAuthCookie(ctx);
  sendSuccess(ctx, {});
}
