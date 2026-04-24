// chat 路由的结构化日志助手：把"请求 / 调用大模型 / 工具调用 / 工具返回 / 错误"等场景
// 收敛成带标题的中文一行文，便于在 console 直接 grep 排错，也不牺牲 JSON payload 精度。
type LogValue = string | number | boolean | null | undefined | Record<string, unknown> | unknown[];

export interface ChatRouteLogger {
  request(content: string): void;
  llmCall(params: LogValue): void;
  llmResult(result: string): void;
  toolCall(name: string, params: LogValue): void;
  toolResult(name: string, result: LogValue): void;
  warn(title: string, reason: LogValue): void;
  error(title: string, reason: LogValue): void;
  trace(title: string, data?: LogValue): void;
  debug(title: string, data?: LogValue): void;
}

/**
 * 把任意 LogValue 转成可打印字符串。
 * 碰到循环引用等 JSON.stringify 抛错的情况，降级成占位符 `[unserializable]`，
 * 确保打日志本身不会把请求处理带崩。
 */
function stringify(value: LogValue): string {
  if (value === undefined) return "";
  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
}

/** 统一的中文日志行格式：`【标题】- 标签：值；`。 */
function format(title: string, label: string, value: LogValue): string {
  return `【${title}】- ${label}：${stringify(value)}；`;
}

/** 工厂方法：每次请求创建一个独立 logger 实例，方便后续按请求注入 requestId 等上下文。 */
export function createChatLogger(): ChatRouteLogger {
  return {
    request: (content) => console.info(format("接收请求", "请求内容为", content)),
    llmCall: (params) => console.info(format("调用大模型", "参数为", params)),
    llmResult: (result) => console.info(format("大模型返回", "结果为", result)),
    toolCall: (name, params) => console.info(format(`调用${name}`, "参数为", params)),
    toolResult: (name, result) => console.info(format(`${name}返回`, "结果为", result)),
    warn: (title, reason) => console.warn(format(title, "原因为", reason)),
    error: (title, reason) => console.error(format(title, "错误为", reason)),
    trace: (title, data) => console.log(format(title, "内容为", data)),
    debug: (title, data) => console.log(format(title, "内容为", data)),
  };
}

/**
 * 截断过长文本给日志用：把连续空白压一格并去首尾空格，超出 maxLength 追加省略号。
 * 用于大模型最终文本输出这类可能上千字的内容。
 */
export function previewText(value: string, maxLength = 500): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

/** 工具返回等 JSON payload 的日志预览；序列化失败时降级为占位符。 */
export function previewJson(value: unknown, maxLength = 500): string {
  try {
    const json = JSON.stringify(value);
    if (!json) return "";
    return json.length > maxLength ? `${json.slice(0, maxLength)}...` : json;
  } catch {
    return "[unserializable]";
  }
}

