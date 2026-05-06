// POST /api/auth/register —— 邮箱 + 用户名 + 密码注册，注册成功立即下发 Cookie。
import type { Context } from "koa";
import { z } from "zod";
import type { AuthResponse } from "@travel/shared";
import { setAuthCookie } from "../../auth/cookie.js";
import { signAuthToken } from "../../auth/jwt.js";
import { hashPassword } from "../../auth/password.js";
import { createUser, findUserByEmail, toAuthUser } from "../../db/repositories/userRepo.js";

/**
 * 请求体 schema：
 * - email 走 zod 内置 email 校验；
 * - password 至少 8 位，不限上限（bcrypt 自身有 72 字节硬限，本地 8 位足够保护新手）；
 * - username 1~30 字符，避免空白 / 超长破坏 UI。
 */
const RegisterSchema = z.object({
  email: z.string().email(),
  username: z.string().min(1).max(30),
  password: z.string().min(8).max(128),
});

/** 注册路由处理器。 */
export async function registerRoute(ctx: Context): Promise<void> {
  const parsed = RegisterSchema.safeParse(ctx.request.body ?? {});
  if (!parsed.success) {
    ctx.status = 400;
    ctx.body = {
      message: "Invalid request body",
      errors: parsed.error.flatten().fieldErrors,
    };
    return;
  }

  const { email, username, password } = parsed.data;

  const existing = await findUserByEmail(email);
  if (existing) {
    ctx.status = 409;
    ctx.body = { message: "Email already registered" };
    return;
  }

  const passwordHash = await hashPassword(password);
  const user = await createUser({ email, username, passwordHash });

  const token = await signAuthToken(user.id, user.email);
  setAuthCookie(ctx, token);

  ctx.status = 201;
  const body: AuthResponse = { user: toAuthUser(user) };
  ctx.body = body;
}
