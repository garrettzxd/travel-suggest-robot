// POST /api/chat 的 SSE 路由编排：本文件只负责把请求校验、SSE 生命周期、LangGraph 流
// 与三类事件 handler 串起来。所有具体能力（消息预处理、流解析、工具元信息、TripCard 合并、
// SSE 帧写入）已拆分到同目录下其他文件，便于解耦与多人并行开发。
import type { Context } from "koa";
import type { ChatRequest } from "@travel/shared";
import { agent } from "../../agent/graph.js";
import { handleModelStream, handleToolEnd, handleToolStart } from "./handlers.js";
import { createChatLogger, previewText } from "./logger.js";
import { historyToAgentMessages } from "./messages.js";
import { createEventEmitter, initSseResponse } from "./sseLifecycle.js";
import {
  ChatRequestSchema,
  createInitialState,
  type LangChainStreamEvent,
} from "./types.js";

/**
 * Koa 处理器。生命周期：
 * 1. 解析请求 → 失败 400；
 * 2. 设置 SSE 响应头、接管 ctx.res；
 * 3. 注册客户端断连监听，异常断连时 abort LangGraph；
 * 4. 流式迭代 LangGraph 事件，按 event.event 分派到三类 handler；
 * 5. 正常结束推 final + done；异常走 catch 推 error + done；finally 关流并解绑监听。
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
  const abortController = new AbortController();
  const state = createInitialState();

  log.request(previewText(input.message));

  const emitEvent = createEventEmitter(ctx, log);
  const { dispose } = initSseResponse(ctx, abortController, log);

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
      // log.debug('流输出', JSON.stringify(event));
      if (abortController.signal.aborted) {
        log.warn("聊天流程已被中止", {
          durationMs: Date.now() - startedAt,
        });
        break;
      }

      if (event.event === "on_chat_model_stream") {
        handleModelStream(event, state, { emitEvent, log });
        continue;
      }

      if (event.event === "on_tool_start") {
        handleToolStart(event, state, { emitEvent, log });
        continue;
      }

      if (event.event === "on_tool_end") {
        handleToolEnd(event, state, { emitEvent, log });
      }

      // weather-only 短路：finalizeTripWeather 已 emit card_weather 且确认是纯天气流，
      // 直接结束循环，不再消费后续模型 token / 工具事件。
      if (state.weatherOnlyShortCircuit) {
        log.debug("weather-only 短路触发，跳过后续 LLM 续流", {
          durationMs: Date.now() - startedAt,
        });
        break;
      }
    }

    // 短路时主动 abort 上游 LangGraph 流，避免 LLM 续写仍在后台烧 token。
    if (state.weatherOnlyShortCircuit && !abortController.signal.aborted) {
      abortController.abort();
    }

    // 不论是 LLM 自然收尾还是 weather-only 短路，都需要给前端补 final + done。
    // 真正的客户端断连仍由 sseLifecycle 中的监听处理，这里靠 weatherOnlyShortCircuit 区分。
    if (state.weatherOnlyShortCircuit || !abortController.signal.aborted) {
      // stream 结束时统一汇报本轮丢弃的空文本 chunk 数量，避免逐条刷日志。
      if (state.skippedEmptyChunkCount > 0) {
        log.debug("模型空 chunk 已忽略", { count: state.skippedEmptyChunkCount });
      }
      log.llmResult(previewText(state.finalContent));
      emitEvent("final", { content: state.finalContent });
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
      });
    }
  } finally {
    dispose();
    // 自接管 ctx.res 后必须自己 end()——Koa 不会再帮我们收尾。
    if (!ctx.res.writableEnded) {
      ctx.res.end();
    }
  }
}
