// 认证模块共享类型：用户信息、注册 / 登录请求体与响应体。
// 注意：服务端持久化的 passwordHash 永远不会出现在 AuthUser 里——前端类型即「公开视图」。

/** 公开的用户视图，绝不含 passwordHash。 */
export interface AuthUser {
  id: string;
  email: string;
  username: string;
  createdAt: number;
}

/** POST /api/auth/register 请求体。 */
export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
}

/** POST /api/auth/login 请求体。 */
export interface LoginRequest {
  email: string;
  password: string;
}

/** 注册 / 登录 / GET /api/auth/me 的 data 载荷。 */
export interface AuthResponse {
  user: AuthUser;
}
