// 一组把 LangChain / LangGraph 流事件中的异构 payload 归一化的纯函数。
// 拿到的形态可能是字符串、对象、ToolMessage 包装、contentBlocks 数组——这里统一收口。

/**
 * 从 LangChain AIMessageChunk 抽取可显示给用户的文本增量。
 * LangChain 1.x 的 chunk 有多种形态：contentBlocks 数组（v1 输出）、纯字符串、
 * 或者旧式 `content` 数组。这里把几种形态都归一成字符串，非 text 块直接跳过。
 */
export function extractTextDelta(messageChunk: unknown): string {
  if (!messageChunk || typeof messageChunk !== "object") {
    return "";
  }

  const chunk = messageChunk as {
    content?: unknown;
    contentBlocks?: Array<{ type?: string; text?: string }>;
  };

  if (Array.isArray(chunk.contentBlocks)) {
    return chunk.contentBlocks
      .filter((block) => block?.type === "text" && typeof block.text === "string")
      .map((block) => block.text)
      .join("");
  }

  if (typeof chunk.content === "string") {
    return chunk.content;
  }

  if (Array.isArray(chunk.content)) {
    return chunk.content
      .map((part) => {
        if (typeof part === "string") return part;
        if (
          part &&
          typeof part === "object" &&
          "text" in part &&
          typeof (part as { text?: unknown }).text === "string"
        ) {
          return (part as { text: string }).text;
        }
        return "";
      })
      .join("");
  }

  return "";
}

/**
 * 工具输入/输出在事件里可能是"已序列化的字符串"或"原始对象"两种形态。
 * 尽量解回 JSON 让前端直接拿到结构化数据；解析失败就按原值回（通常是纯字符串报错信息）。
 */
export function normalizeToolPayload(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * 从 `on_tool_end` 事件的 output 中取工具真实返回值。
 * 有时 LangChain 会把返回值包一层 `{content: ...}`（ToolMessage 形态），
 * 兼容两种形状后再交给 normalizeToolPayload 做 JSON 反序列化。
 */
export function extractToolResult(output: unknown): unknown {
  if (output && typeof output === "object" && "content" in output) {
    return normalizeToolPayload((output as { content?: unknown }).content);
  }

  return normalizeToolPayload(output);
}
