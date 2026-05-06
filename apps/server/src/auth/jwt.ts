// 基于 jose 的 HS256 JWT 签发 / 验签。复用已装的 jose 库，避免引入冗余依赖。
// 密钥来自 env.JWT_SECRET（最少 32 字符，env.ts 里已校验）。
import { SignJWT, jwtVerify, errors as joseErrors } from "jose";
import { env } from "../env.js";

const secret = new TextEncoder().encode(env.JWT_SECRET);
const ALG = "HS256";

/** JWT payload 解析后的轻量视图。sub = userId。 */
export interface AuthTokenPayload {
  userId: string;
  email: string;
}

/**
 * 签发 30 天有效期的访问 token。
 * 与 Cookie maxAge 严格对齐，避免 token 已过期但 Cookie 还在的尴尬态。
 */
export async function signAuthToken(userId: string, email: string): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: ALG })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
}

/**
 * 验签 + 解析 payload。
 * 失败时统一抛 InvalidAuthTokenError，方便中间件分类处理。
 */
export async function verifyAuthToken(token: string): Promise<AuthTokenPayload> {
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: [ALG] });
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
      throw new InvalidAuthTokenError("payload 缺少 sub 或 email");
    }
    return { userId: payload.sub, email: payload.email };
  } catch (err) {
    if (err instanceof joseErrors.JOSEError) {
      throw new InvalidAuthTokenError(err.message);
    }
    throw err;
  }
}

/** 验签失败时统一抛出的错误类型，便于中间件 catch 后映射为 401。 */
export class InvalidAuthTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAuthTokenError";
  }
}
