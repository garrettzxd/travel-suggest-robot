import type { Context, Middleware } from "koa";
import { API_CODE, type ApiCode, type ApiResponse } from "@travel/shared";

interface ApiErrorOptions {
  status: number;
  code: ApiCode;
  message: string;
  data?: Record<string, unknown>;
}

/** 可被全局异常中间件识别的业务错误。 */
export class ApiError extends Error {
  status: number;
  code: ApiCode;
  data: Record<string, unknown>;

  /** 创建携带 HTTP 状态、业务 code 和可选 data 的错误对象。 */
  constructor({ status, code, message, data = {} }: ApiErrorOptions) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

/** 写入统一成功响应 envelope。 */
export function sendSuccess<TData>(
  ctx: Context,
  data: TData,
  status = 200,
  message = "",
): void {
  ctx.status = status;
  const body: ApiResponse<TData> = {
    code: API_CODE.SUCCESS,
    data,
    message,
  };
  ctx.body = body;
}

/** 写入统一失败响应 envelope。 */
export function sendError(ctx: Context, error: ApiError): void {
  ctx.status = error.status;
  const body: ApiResponse<Record<string, unknown>> = {
    code: error.code,
    data: error.data,
    message: error.message,
  };
  ctx.body = body;
}

/** 请求参数错误。 */
export function badRequest(message: string, data?: Record<string, unknown>): ApiError {
  return new ApiError({
    status: 400,
    code: API_CODE.BAD_REQUEST,
    message,
    data,
  });
}

/** 未登录或登录态失效错误。 */
export function unauthorized(message = "Unauthorized"): ApiError {
  return new ApiError({
    status: 401,
    code: API_CODE.UNAUTHORIZED,
    message,
  });
}

/** 登录凭证错误，不触发前端全局未登录跳转。 */
export function invalidCredentials(message = "Invalid email or password"): ApiError {
  return new ApiError({
    status: 401,
    code: API_CODE.INVALID_CREDENTIALS,
    message,
  });
}

/** 资源不存在错误。 */
export function notFound(message: string): ApiError {
  return new ApiError({
    status: 404,
    code: API_CODE.NOT_FOUND,
    message,
  });
}

/** 资源冲突错误。 */
export function conflict(message: string): ApiError {
  return new ApiError({
    status: 409,
    code: API_CODE.CONFLICT,
    message,
  });
}

/** 把未知异常收敛成统一服务端错误。 */
function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  return new ApiError({
    status: 500,
    code: API_CODE.INTERNAL_ERROR,
    message: "Internal server error",
  });
}

/** 捕获路由抛出的业务异常并统一写入 JSON envelope。 */
export const apiErrorMiddleware: Middleware = async (ctx, next) => {
  try {
    await next();
    if (ctx.path.startsWith("/api/") && ctx.status === 404 && ctx.body == null) {
      sendError(ctx, notFound("API route not found"));
    }
  } catch (error) {
    if (ctx.respond === false || ctx.headerSent) {
      throw error;
    }
    const apiError = toApiError(error);
    sendError(ctx, apiError);
    if (!(error instanceof ApiError)) {
      ctx.app.emit("error", error, ctx);
    }
  }
};
