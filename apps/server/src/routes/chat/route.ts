// POST /api/chat 的 SSE 路由编排：本文件只负责把请求校验、SSE 生命周期、LangGraph 流
// 与三类事件 handler 串起来。所有具体能力（消息预处理、流解析、工具元信息、TripCard 合并、
// SSE 帧写入）已拆分到同目录下其他文件，便于解耦与多人并行开发。
//
// 持久化版本流程（本次改造重点）：
//   auth 中间件已注入 ctx.state.userId
//     → 解析请求 → 解析/创建 conversation → emit 'conversation' SSE 帧
//     → INSERT user message → 加载历史 → 跑 LangGraph 流
//     → finally 块落 assistant message + UPDATE conversations.updatedAt
import type { Context } from "koa";
import { agent } from "../../agent/graph.js";
import {
  createConversation,
  findOwnedConversation,
  touchConversation,
} from "../../db/repositories/conversationRepo.js";
import {
  insertAssistantMessage,
  insertUserMessage,
  listMessagesByConversation,
} from "../../db/repositories/messageRepo.js";
import { handleModelStream, handleToolEnd, handleToolStart } from "./handlers.js";
import { createChatLogger, previewText } from "./logger.js";
import { dbMessagesToAgentMessages } from "./messages.js";
import { extractAssistantArtifacts } from "./persistence.js";
import { createEventEmitter, initSseResponse } from "./sseLifecycle.js";
import {
  ChatRequestSchema,
  createInitialState,
  type LangChainStreamEvent,
} from "./types.js";

/**
 * Koa 处理器。生命周期：
 * 1. authRequired 中间件已注入 ctx.state.userId；本函数只取用；
 * 2. 解析请求 → 失败 400；
 * 3. 解析或新建 conversation（强制归属权校验）；
 * 4. 设置 SSE 响应头、接管 ctx.res；首帧推 'conversation' 让前端拿到 id；
 * 5. 把 user message 写库（保证刷新可见）；
 * 6. 从 DB 读全量历史，转成 LangGraph messages；
 * 7. 注册客户端断连监听，异常断连时 abort LangGraph；
 * 8. 流式迭代 LangGraph 事件，按 event.event 分派到三类 handler；
 * 9. 正常结束推 final + done；异常走 catch 推 error + done；
 * 10. finally：落 assistant message + 刷新 conversation.updatedAt；关流并解绑监听。
 */
export async function chatRoute(ctx: Context): Promise<void> {
  const log = createChatLogger();
  const startedAt = Date.now();
  const userId = ctx.state.userId;
  if (!userId) {
    // 兜底：理论上 authRequired 已拦截，这里仅防守
    ctx.status = 401;
    ctx.body = { message: "Unauthorized" };
    return;
  }

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

  const input = parsed.data;
  let conversationId: string;
  let isNewConversation = false;

  if (input.conversationId) {
    const owned = await findOwnedConversation(userId, input.conversationId);
    if (!owned) {
      // 不暴露归属信息——404 即可，无论 id 不存在还是不属于该用户
      ctx.status = 404;
      ctx.body = { message: "Conversation not found" };
      return;
    }
    conversationId = owned.id;
  } else {
    const created = await createConversation({
      userId,
      // 用首条 user message 截 30 字派生 title；conversationRepo.deriveTitle 由 createConversation 内部不调用，
      // 这里显式传入，保证 title 一开始就有内容
      title: deriveTitleFromMessage(input.message),
    });
    conversationId = created.id;
    isNewConversation = true;
  }

  log.request(previewText(input.message));

  const abortController = new AbortController();
  const state = createInitialState();
  const emitEvent = createEventEmitter(ctx, log);
  const { dispose } = initSseResponse(ctx, abortController, log);

  // 首帧告诉前端本轮归属哪个 conversationId（新建 / 已有都给）
  emitEvent("conversation", { conversationId, isNew: isNewConversation });

  // 用户消息先入库，再跑 LLM——任何后续异常都不会让 user message 丢失
  await insertUserMessage({ conversationId, content: input.message });

  // 从 DB 读全量历史（已含刚写入的 user message，按 createdAt 升序）
  const historyRows = await listMessagesByConversation(conversationId);

  try {
    log.llmCall({
      message: input.message,
      historyCount: historyRows.length,
      streamMode: "events",
      conversationId,
    });

    const agentStream = agent.streamEvents(
      {
        messages: dbMessagesToAgentMessages(historyRows),
      },
      {
        signal: abortController.signal,
        version: "v2",
      },
    );

    log.debug("LLM 流式响应已建立");

    for await (const event of agentStream as AsyncIterable<LangChainStreamEvent>) {
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

      // 短路：handler 已 emit 完所有必要的结构化事件，前端无需 LLM 续流也能完整渲染，
      // 直接结束循环，不再消费后续模型 token / 工具事件。两个触发点：
      //   1) handleFinalizeTripWeatherEnd —— 纯天气查询，card_weather 后短路；
      //   2) handleFinalizeTripAttractionsSummaryEnd —— 完整 TripCard 流，最后一段 card 事件后短路。
      if (state.shouldShortCircuit) {
        log.debug("短路触发，跳过后续 LLM 续流", {
          durationMs: Date.now() - startedAt,
        });
        break;
      }
    }

    // 短路时主动 abort 上游 LangGraph 流，避免 LLM 续写仍在后台烧 token。
    if (state.shouldShortCircuit && !abortController.signal.aborted) {
      abortController.abort();
    }

    // 不论是 LLM 自然收尾还是短路，都需要给前端补 final + done。
    if (state.shouldShortCircuit || !abortController.signal.aborted) {
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
    // 落库 assistant 制品 + 刷新对话活跃时间。
    // 即使前文异常也尽量落一条空消息，避免列表里出现"只有 user 没有 assistant"的孤儿对话；
    // 但写库本身要 try/catch 保护，DB 异常不能再次崩溃响应。
    try {
      const artifacts = extractAssistantArtifacts(state);
      const hasAnyArtifact =
        artifacts.content.length > 0 ||
        !!artifacts.card ||
        !!artifacts.itinerary;
      if (hasAnyArtifact) {
        await insertAssistantMessage({
          conversationId,
          content: artifacts.content,
          artifacts: {
            card: artifacts.card ?? null,
            itinerary: artifacts.itinerary ?? null,
          },
        });
        await touchConversation(conversationId);
      } else {
        log.debug("本轮无 assistant 制品可持久化", { conversationId });
      }
    } catch (err) {
      log.error("持久化 assistant 消息失败", {
        conversationId,
        errorName: err instanceof Error ? err.name : "UnknownError",
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }

    dispose();
    if (!ctx.res.writableEnded) {
      ctx.res.end();
    }
  }
}

/** 把首条 user message 截断成 title——单文件内复用，避免 import 链过长。 */
function deriveTitleFromMessage(message: string): string {
  const trimmed = message.replace(/\s+/g, " ").trim();
  return trimmed.length > 30 ? `${trimmed.slice(0, 30)}…` : trimmed || "新的对话";
}
