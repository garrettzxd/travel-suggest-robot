// POST /api/chat 的 SSE 路由实现。
// 职责：校验请求 → 初始化 SSE 响应流 → 驱动 LangGraph streamEvents → 把模型 token /
// 工具开始结束事件翻译成前端约定的 SSE 事件。断连 / 异常 / 正常结束三条路径都要收尾。
import { PassThrough } from "node:stream";
import type { Context } from "koa";
import type { ChatMessage, ChatRequest, ToolName } from "@travel/shared";
import { agent } from "../agent/graph.js";
import { writeEvent } from "../utils/sse.js";
import {
  createChatLogger,
  previewJson,
  previewText,
  type ChatRouteLogger,
} from "./chat.logger.js";
import {
  ChatRequestSchema,
  type EventWriter,
  type ToolCall,
} from "./chat.types.js";

/** LangGraph `streamEvents({ version: "v2" })` 每个产出的事件形态。 */
interface LangChainStreamEvent {
  event: string;
  name: string;
  run_id: string;
  data?: {
    input?: unknown;
    output?: unknown;
    chunk?: unknown;
    error?: string;
  };
  metadata?: Record<string, unknown>;
}

/**
 * 把前端历史消息拼成 LangGraph 能消费的 `{role, content}[]`，末尾附上本轮 user 输入。
 * 过滤空内容消息：空 assistant 会让 Moonshot 报 "unknown content type:"；
 * 历史里的占位消息（abort / 无 token 的 final）必须在这里丢掉。
 */
function historyToAgentMessages(history: ChatMessage[], message: string) {
  return [
    ...history
      .filter((item) => typeof item.content === "string" && item.content.trim() !== "")
      .map((item) => ({
        role: item.role,
        content: item.content,
      })),
    {
      role: "user" as const,
      content: message,
    },
  ];
}

/**
 * 从 LangChain AIMessageChunk 抽取可显示给用户的文本增量。
 * LangChain 1.x 的 chunk 有多种形态：contentBlocks 数组（v1 输出）、纯字符串、
 * 或者旧式 `content` 数组。这里把几种形态都归一成字符串，非 text 块直接跳过。
 */
function extractTextDelta(messageChunk: unknown): string {
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
function normalizeToolPayload(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/** 日志中展示的工具别名（中文），找不到就回退原始英文名。 */
function toolLabel(name: ToolName): string {
  if (name === "getWeather") return "天气工具";
  if (name === "getAttractions") return "景点工具";
  return name;
}

/** 类型守卫：LangChain 事件里的 name 是裸 string，先收窄到已知工具再处理。 */
function isToolName(name: string): name is ToolName {
  return name === "getWeather" || name === "getAttractions";
}

/**
 * 从 `on_tool_end` 事件的 output 中取工具真实返回值。
 * 有时 LangChain 会把返回值包一层 `{content: ...}`（ToolMessage 形态），
 * 兼容两种形状后再交给 normalizeToolPayload 做 JSON 反序列化。
 */
function extractToolResult(output: unknown): unknown {
  if (output && typeof output === "object" && "content" in output) {
    return normalizeToolPayload((output as { content?: unknown }).content);
  }

  return normalizeToolPayload(output);
}

/**
 * 从 LangGraph `updates` 流里抽取 tool_calls 并把每个调用作为一条 tool_start 事件推给前端。
 * 注意：这个分支目前未被主链路使用（主链路走 streamEvents 的 on_tool_start），
 * 保留是为了兼容未来切换到 updates 模式时的降级路径。
 */
function emitToolStarts(
  updateChunk: unknown,
  startedToolCalls: Set<string>,
  emitEvent: EventWriter,
  log: ChatRouteLogger,
): void {
  if (!updateChunk || typeof updateChunk !== "object") {
    return;
  }

  const updateEntries = Object.values(updateChunk as Record<string, unknown>);
  for (const update of updateEntries) {
    if (!update || typeof update !== "object") {
      continue;
    }

    const messages = (update as { messages?: unknown }).messages;
    if (!Array.isArray(messages)) {
      continue;
    }

    for (const message of messages) {
      const toolCalls = (message as { tool_calls?: ToolCall[] }).tool_calls;
      if (!Array.isArray(toolCalls)) {
        continue;
      }

      for (const [index, toolCall] of toolCalls.entries()) {
        const name = toolCall.name as ToolName | undefined;
        if (!name) continue;

        const toolCallId = toolCall.id ?? `${name}-${index}`;
        if (startedToolCalls.has(toolCallId)) {
          continue;
        }

        // LangGraph 的 updates 里可能重复带出历史消息，用 toolCallId 去重避免重复推送工具开始事件。
        startedToolCalls.add(toolCallId);
        log.toolCall(toolLabel(name), {
          toolCallId,
          toolName: name,
          args: toolCall.args ?? {},
        });
        emitEvent("tool_start", {
          name,
          args: toolCall.args ?? {},
        });
      }
    }
  }
}

/**
 * `emitToolStarts` 的姊妹方法：从 updates 里抽 ToolMessage 推 tool_end。
 * 同样是 updates 模式的降级路径，主链路走 streamEvents 的 on_tool_end。
 */
function emitToolEnds(
  updateChunk: unknown,
  completedToolCalls: Set<string>,
  emitEvent: EventWriter,
  log: ChatRouteLogger,
): void {
  if (!updateChunk || typeof updateChunk !== "object") {
    return;
  }

  const updateEntries = Object.values(updateChunk as Record<string, unknown>);
  for (const update of updateEntries) {
    if (!update || typeof update !== "object") {
      continue;
    }

    const messages = (update as { messages?: unknown }).messages;
    if (!Array.isArray(messages)) {
      continue;
    }

    for (const [index, message] of messages.entries()) {
      const toolName = (message as { name?: string }).name as ToolName | undefined;
      if (!toolName) {
        continue;
      }

      const messageType = (message as { _getType?: () => string })._getType?.();
      if (messageType && messageType !== "tool") {
        continue;
      }

      const toolCallId =
        (message as { tool_call_id?: string }).tool_call_id ?? `${toolName}-${index}`;
      if (completedToolCalls.has(toolCallId)) {
        continue;
      }

      completedToolCalls.add(toolCallId);
      const result = normalizeToolPayload((message as { content?: unknown }).content);
      log.toolResult(toolLabel(toolName), {
        toolCallId,
        toolName,
        resultPreview: previewJson(result),
      });
      emitEvent("tool_end", {
        name: toolName,
        result,
      });
    }
  }
}

/**
 * Koa 处理器。生命周期：
 * 1. 解析请求 → 失败 400；
 * 2. 设置 SSE 响应头、创建 PassThrough 作为响应体；
 * 3. 注册客户端断连监听，异常断连时 abort LangGraph；
 * 4. 流式迭代 LangGraph 事件，翻译成前端约定的 SSE 事件类型；
 * 5. 正常结束推 final + done；异常走 catch 推 error + done；finally 关流。
 */
export async function chatRoute(ctx: Context): Promise<void> {
  const log = createChatLogger();
  const startedAt = Date.now();

  const parsed = ChatRequestSchema.safeParse(ctx.request.body ?? {});
  if (!parsed.success) {
    log.warn("请求参数校验失败", parsed.error.flatten().fieldErrors);
    ctx.status = 400;
    ctx.body = {
      message: "Invalid request body",
      errors: parsed.error.flatten().fieldErrors,
    };
    return;
  }

  const input: ChatRequest = parsed.data;
  const stream = new PassThrough();
  const abortController = new AbortController();
  const startedToolCalls = new Set<string>();
  const completedToolCalls = new Set<string>();
  let sseEventCount = 0;
  let finalContent = "";

  log.request(previewText(input.message));

  ctx.status = 200;
  ctx.set({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  ctx.body = stream;
  ctx.respond = true;
  ctx.res.flushHeaders?.();

  const emitEvent: EventWriter = (event, data) => {
    if (stream.destroyed || stream.writableEnded) {
      log.warn("SSE 流已关闭，跳过事件推送", {
        event,
        streamDestroyed: stream.destroyed,
        streamWritableEnded: stream.writableEnded,
      });
      return;
    }

    sseEventCount += 1;
    const writable = writeEvent(stream, event, data);
    log.trace("SSE 事件已写入", { event, writable, sseEventCount });
  };

  // POST 请求体读完也会触发 req.close，不能把它当作浏览器断开连接。
  const onRequestClose = () => {
    log.debug("请求流已关闭", {
      requestComplete: ctx.req.complete,
      responseWritableEnded: ctx.res.writableEnded,
    });
  };

  // SSE 的真实断连应以响应流为准：响应未正常结束却 close，才中止 LangGraph。
  const onResponseClose = () => {
    if (ctx.res.writableEnded) {
      log.debug("响应流正常关闭");
      return;
    }

    log.warn("客户端连接已断开，停止大模型请求", {
      responseDestroyed: ctx.res.destroyed,
      aborted: abortController.signal.aborted,
    });
    abortController.abort();
    stream.end();
  };

  ctx.req.on("close", onRequestClose);
  ctx.res.on("close", onResponseClose);

  try {
    log.llmCall({
      message: input.message,
      historyCount: input.history.length,
      streamMode: "events",
    });

    const agentStream = agent.streamEvents(
      {
        messages: historyToAgentMessages(input.history, input.message),
      },
      {
        signal: abortController.signal,
        version: "v2",
      },
    );

    log.debug("LLM 流式响应已建立");

    for await (const event of agentStream as AsyncIterable<LangChainStreamEvent>) {
      log.debug('流输出', JSON.stringify(event));
      if (abortController.signal.aborted) {
        log.warn("聊天流程已被中止", {
          durationMs: Date.now() - startedAt,
          sseEventCount,
        });
        break;
      }

      if (event.event === "on_chat_model_stream") {
        const delta = extractTextDelta(event.data?.chunk);
        if (!delta) {
          log.trace("忽略空文本模型消息", {
            eventName: event.name,
            runId: event.run_id,
          });
          continue;
        }

        finalContent += delta;
        emitEvent("token", { delta });
        continue;
      }

      if (event.event === "on_tool_start" && isToolName(event.name)) {
        if (startedToolCalls.has(event.run_id)) {
          continue;
        }

        startedToolCalls.add(event.run_id);
        const args = normalizeToolPayload(event.data?.input ?? {});
        log.toolCall(toolLabel(event.name), {
          toolCallId: event.run_id,
          toolName: event.name,
          args,
        });
        emitEvent("tool_start", {
          name: event.name,
          args,
        });
        continue;
      }

      if (event.event === "on_tool_end" && isToolName(event.name)) {
        if (completedToolCalls.has(event.run_id)) {
          continue;
        }

        completedToolCalls.add(event.run_id);
        const result = extractToolResult(event.data?.output);
        log.toolResult(toolLabel(event.name), {
          toolCallId: event.run_id,
          toolName: event.name,
          resultPreview: previewJson(result),
        });
        emitEvent("tool_end", {
          name: event.name,
          result,
        });
      }
    }

    if (!abortController.signal.aborted) {
      log.llmResult(previewText(finalContent));
      emitEvent("final", { content: finalContent });
      emitEvent("done", {});
    }
  } catch (error) {
    if (!abortController.signal.aborted) {
      const message = error instanceof Error ? error.message : "Unknown server error";
      log.error("处理失败", {
        durationMs: Date.now() - startedAt,
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage: message,
        errorStack: error instanceof Error ? error.stack : undefined,
      });
      emitEvent("error", { message });
      emitEvent("done", {});
    } else {
      log.warn("聊天接口已中止", {
        durationMs: Date.now() - startedAt,
        sseEventCount,
      });
    }
  } finally {
    ctx.req.off("close", onRequestClose);
    ctx.res.off("close", onResponseClose);
    stream.end();
  }
}
