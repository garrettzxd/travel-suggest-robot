// POST /api/auth/login —— 邮箱密码登录，成功后下发 Cookie。
// 错误文案统一不区分「邮箱不存在」/「密码错误」，避免帐号枚举攻击。
import type { Context } from "koa";
import { z } from "zod";
import type { AuthResponse } from "@travel/shared";
import { setAuthCookie } from "../../auth/cookie.js";
import { signAuthToken } from "../../auth/jwt.js";
import { verifyPassword } from "../../auth/password.js";
import { findUserByEmail, toAuthUser } from "../../db/repositories/userRepo.js";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
});

/** 登录路由处理器。 */
export async function loginRoute(ctx: Context): Promise<void> {
  const parsed = LoginSchema.safeParse(ctx.request.body ?? {});
  if (!parsed.success) {
    ctx.status = 400;
    ctx.body = {
      message: "Invalid request body",
      errors: parsed.error.flatten().fieldErrors,
    };
    return;
  }

  const { email, password } = parsed.data;
  const user = await findUserByEmail(email);

  // 不区分「邮箱不存在」与「密码错误」，统一返回 401 + 同一文案
  if (!user) {
    ctx.status = 401;
    ctx.body = { message: "Invalid email or password" };
    return;
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    ctx.status = 401;
    ctx.body = { message: "Invalid email or password" };
    return;
  }

  const token = await signAuthToken(user.id, user.email);
  setAuthCookie(ctx, token);

  ctx.status = 200;
  const body: AuthResponse = { user: toAuthUser(user) };
  ctx.body = body;
}
