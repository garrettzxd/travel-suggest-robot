import type { AuthUser, LoginRequest, RegisterRequest } from '@travel/shared';

/** 统一错误工厂：从响应 JSON 提取 message 字段，保留服务端文案。 */
async function throwFromResponse(res: Response): Promise<never> {
  const data = await res.json().catch(() => ({}));
  throw new Error((data as { message?: string }).message ?? `请求失败 (${res.status})`);
}

/** GET /api/auth/me — 恢复当前会话，返回用户信息；未登录返回 null。 */
export async function getMe(): Promise<AuthUser | null> {
  const res = await fetch('/api/auth/me', { credentials: 'include' });
  if (res.status === 401) return null;
  if (!res.ok) await throwFromResponse(res);
  const data = await res.json() as { user: AuthUser };
  return data.user;
}

/** POST /api/auth/login — 邮箱 + 密码登录，成功返回用户信息，失败抛 Error。 */
export async function postLogin(body: LoginRequest): Promise<AuthUser> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) await throwFromResponse(res);
  const data = await res.json() as { user: AuthUser };
  return data.user;
}

/** POST /api/auth/register — 注册新账号，成功返回用户信息，失败抛 Error。 */
export async function postRegister(body: RegisterRequest): Promise<AuthUser> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) await throwFromResponse(res);
  const data = await res.json() as { user: AuthUser };
  return data.user;
}

/** POST /api/auth/logout — 清除服务端 Cookie，无返回值。 */
export async function postLogout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
}
