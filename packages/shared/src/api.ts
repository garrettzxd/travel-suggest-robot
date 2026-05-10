/** 通用 API 响应 envelope，普通 JSON 接口统一使用。 */
export interface ApiResponse<TData> {
  code: number;
  data: TData;
  message: string;
}

/** 前后端共享的业务响应码。 */
export const API_CODE = {
  SUCCESS: 0,
  UNAUTHORIZED: 10001,
  INVALID_CREDENTIALS: 10002,
  BAD_REQUEST: 40001,
  NOT_FOUND: 40401,
  CONFLICT: 40901,
  INTERNAL_ERROR: 50000,
} as const;

/** 业务响应码联合类型。 */
export type ApiCode = (typeof API_CODE)[keyof typeof API_CODE];
