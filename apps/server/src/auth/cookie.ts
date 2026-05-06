// Cookie 设置 / 清除助手。register、login、logout 三处共用。
import type { Context } from "koa";
import { env } from "../env.js";

/** 设置 httpOnly Cookie，30 天有效期与 JWT 对齐。 */
export function setAuthCookie(ctx: Context, token: string): void {
  ctx.cookies.set(env.COOKIE_NAME, token, {
    httpOnly: true,
    // production 时强制 https 才能传输；本地 http 调试需要 false 才能写入
    secure: env.NODE_ENV === "production",
    // Lax 配合 CORS credentials:true 可在跨端口（同站不同 port）场景工作
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

/** 清除认证 Cookie。logout 路由使用。 */
export function clearAuthCookie(ctx: Context): void {
  ctx.cookies.set(env.COOKIE_NAME, null, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
}
