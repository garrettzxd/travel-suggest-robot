// 和风天气 (QWeather) 的 JWT 鉴权模块：用 Ed25519 私钥本地签发短 TTL 的 JWT，
// 并缓存到接近过期前自动刷新。所有调用 QWeather API 的地方都应走 `qweatherFetch`。
import { readFile } from "node:fs/promises";
import { SignJWT, importPKCS8, type KeyLike } from "jose";
import { env } from "../../env.js";

// QWeather 要求 JWT exp - iat ≤ 24h，15 分钟已足够且安全。
const TOKEN_TTL_SECONDS = 900;
// 过期前 60s 就视作失效并刷新，避免卡在边界上请求被拒。
const REFRESH_SKEW_SECONDS = 60;

let cachedKey: KeyLike | null = null;
let cachedToken: { value: string; expiresAt: number } | null = null;

/** 读取并缓存 PKCS8 PEM 私钥；首次用 jose 导入成 KeyLike，后续复用。 */
async function loadPrivateKey(): Promise<KeyLike> {
  if (cachedKey) return cachedKey;
  const pem = await readFile(env.QWEATHER_PRIVATE_KEY_PATH, "utf8");
  cachedKey = await importPKCS8(pem, "EdDSA");
  return cachedKey;
}

/**
 * 取一个还在有效期内的 JWT，过期前 60s 会主动重签。
 * iat 回退 30s 是为了抵御本机与 QWeather 服务器间的时钟漂移。
 */
export async function getQWeatherToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt - REFRESH_SKEW_SECONDS > now) {
    return cachedToken.value;
  }

  const key = await loadPrivateKey();
  const iat = now - 30;
  const exp = now + TOKEN_TTL_SECONDS;

  // header.kid 指向凭据 ID，sub 指向项目 ID，二者都由控制台生成，不能互换。
  const value = await new SignJWT({})
    .setProtectedHeader({ alg: "EdDSA", kid: env.QWEATHER_KEY_ID })
    .setIssuedAt(iat)
    .setSubject(env.QWEATHER_PROJECT_ID)
    .setExpirationTime(exp)
    .sign(key);

  cachedToken = { value, expiresAt: exp };
  return value;
}

/** 带 JWT 的 fetch 包装。统一设置 Accept=application/json，避免 QWeather 返回 GZIP 文本。 */
export async function qweatherFetch(url: string): Promise<Response> {
  const token = await getQWeatherToken();
  return fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
}
