import { API_CODE, type ApiResponse } from '@travel/shared';

const UNAUTHORIZED_EVENT = 'travel:api-unauthorized';

interface ReadApiOptions {
  notifyUnauthorized?: boolean;
}

/** 按 Vite base 拼接应用内绝对路径，支持部署在 /travel/ 这类子路径下。 */
export function appPath(path: string): string {
  const base = import.meta.env.BASE_URL;
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}` || normalizedPath;
}

/** 前端 API 错误，保留 HTTP status、业务 code 和服务端 data。 */
export class ApiError extends Error {
  status: number;
  code: number;
  data: unknown;

  /** 创建统一 API 错误对象。 */
  constructor(message: string, code: number, status: number, data: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.data = data;
  }
}

/** 判断错误是否为未登录业务错误。 */
export function isUnauthorizedError(error: unknown): boolean {
  return error instanceof ApiError && error.code === API_CODE.UNAUTHORIZED;
}

/** 订阅全局未登录事件，返回取消订阅函数。 */
export function onUnauthorized(handler: () => void): () => void {
  window.addEventListener(UNAUTHORIZED_EVENT, handler);
  return () => window.removeEventListener(UNAUTHORIZED_EVENT, handler);
}

/** 通知应用当前登录态已失效。 */
function notifyUnauthorized(): void {
  window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
}

/** 从 Response 中读取统一 API envelope，并返回 data。 */
export async function readApiData<TData>(
  res: Response,
  options: ReadApiOptions = {},
): Promise<TData> {
  const { notifyUnauthorized: shouldNotifyUnauthorized = true } = options;
  const text = await res.text();
  const fallbackMessage = `Request failed (${res.status})`;
  let payload: ApiResponse<TData> | null = null;

  if (text) {
    try {
      payload = JSON.parse(text) as ApiResponse<TData>;
    } catch {
      throw new ApiError(text || fallbackMessage, res.status, res.status, {});
    }
  }

  if (!payload || typeof payload.code !== 'number') {
    throw new ApiError(fallbackMessage, res.status, res.status, {});
  }

  if (payload.code === API_CODE.SUCCESS && res.ok) {
    return payload.data;
  }

  const error = new ApiError(
    payload.message || fallbackMessage,
    payload.code,
    res.status,
    payload.data,
  );
  if (payload.code === API_CODE.UNAUTHORIZED && shouldNotifyUnauthorized) {
    notifyUnauthorized();
  }
  throw error;
}

/** POST JSON 请求并按统一 API envelope 返回 data。 */
export async function postJson<TResponse, TBody extends object>(
  url: string,
  body: TBody,
): Promise<TResponse> {
  const res = await fetch(appPath(url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  return readApiData<TResponse>(res);
}
