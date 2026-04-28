const MAX_USER_INPUT_LENGTH = 5000;
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

/** 校验 URL 是否为安全 scheme，用于 CSS url() 注入防护。 */
export function sanitizeCssUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : '';
  } catch {
    return '';
  }
}

/**
 * 清洗用户输入文本：去除首尾空白和控制字符，并拒绝超长内容。
 * 返回 null 表示清洗后为空或超过允许长度。
 */
export function sanitizeUserInput(
  text: string,
  maxLength = MAX_USER_INPUT_LENGTH,
): string | null {
  const sanitized = text.replace(CONTROL_CHARS, '').trim();
  if (!sanitized || sanitized.length > maxLength) return null;
  return sanitized;
}

/** 运行时校验 SSE 事件 payload，异常时跳过并给出可排查的 warn。 */
export function validateSsePayload<T>(
  event: string,
  data: unknown,
  validator: (d: unknown) => d is T,
): T | null {
  if (validator(data)) return data;
  console.warn(`[travel-chat] Ignored invalid SSE payload: ${event}`, data);
  return null;
}
