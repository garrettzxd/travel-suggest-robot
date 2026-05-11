import type { AuthUser, LoginRequest, RegisterRequest } from '@travel/shared';
import { appPath, isUnauthorizedError, postJson, readApiData } from './http';

/** GET /api/auth/me — 恢复当前会话，返回用户信息；未登录返回 null。 */
export async function getMe(): Promise<AuthUser | null> {
  const res = await fetch(appPath('/api/auth/me'), { credentials: 'include' });
  try {
    const data = await readApiData<{ user: AuthUser }>(res, { notifyUnauthorized: false });
    return data.user;
  } catch (error) {
    if (isUnauthorizedError(error)) return null;
    throw error;
  }
}

/** POST /api/auth/login — 邮箱 + 密码登录，成功返回用户信息，失败抛 Error。 */
export async function postLogin(body: LoginRequest): Promise<AuthUser> {
  const data = await postJson<{ user: AuthUser }, LoginRequest>('/api/auth/login', body);
  return data.user;
}

/** POST /api/auth/register — 注册新账号，成功返回用户信息，失败抛 Error。 */
export async function postRegister(body: RegisterRequest): Promise<AuthUser> {
  const data = await postJson<{ user: AuthUser }, RegisterRequest>('/api/auth/register', body);
  return data.user;
}

/** POST /api/auth/logout — 清除服务端 Cookie，无返回值。 */
export async function postLogout(): Promise<void> {
  const res = await fetch(appPath('/api/auth/logout'), { method: 'POST', credentials: 'include' });
  await readApiData<Record<string, never>>(res);
}
