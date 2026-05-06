// GET /api/auth/me —— 前端启动时调用以恢复登录态。挂在受 authRequired 保护的路由组上。
import type { Context } from "koa";
import type { AuthResponse } from "@travel/shared";
import { findUserById, toAuthUser } from "../../db/repositories/userRepo.js";

/**
 * me 路由处理器。
 * authRequired 中间件已注入 ctx.state.userId；理论上不会出现 user 为空，
 * 若发生（用户被删但 token 未过期），返回 401 让前端清登录态。
 */
export async function meRoute(ctx: Context): Promise<void> {
  const userId = ctx.state.userId;
  if (!userId) {
    // 防御式分支：authRequired 已保证此处必有值
    ctx.status = 401;
    ctx.body = { message: "Unauthorized" };
    return;
  }

  const user = await findUserById(userId);
  if (!user) {
    ctx.status = 401;
    ctx.body = { message: "User no longer exists" };
    return;
  }

  ctx.status = 200;
  const body: AuthResponse = { user: toAuthUser(user) };
  ctx.body = body;
}
