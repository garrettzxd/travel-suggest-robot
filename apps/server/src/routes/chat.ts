// POST /api/chat 的 SSE 路由实现。
// 职责：校验请求 → 初始化 SSE 响应流 → 驱动 LangGraph streamEvents → 把模型 token /
// 工具开始结束事件翻译成前端约定的 SSE 事件。断连 / 异常 / 正常结束三条路径都要收尾。
import type { Context } from "koa";
import type {
  Attraction,
  ChatMessage,
  ChatRequest,
  Itinerary,
  ToolName,
  TripCard,
  WeatherSnapshot,
} from "@travel/shared";
import { agent } from "../agent/graph.js";
import type { FinalizeTripCardInput } from "../agent/tools/finalizeTripCard.js";
import type { RecommendItineraryInput } from "../agent/tools/recommendItinerary.js";
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
 *
 * 处理两类边界情况：
 * - 空 assistant content：前端有时会把"已完成的结构化卡片回合"合成 "[已为「xxx」生成...]"
 *   这种摘要发回来；但万一没合成（旧客户端 / 异常路径）就只剩 ""。直接发给 Moonshot
 *   会报 "unknown content type:"，且模型也会以为上一轮没完成而重复调工具。
 *   这里统一兜底成 "[此前一回合已完成，请勿重复调用相同工具]" 的占位。
 * - user 空 content：当作真正的空消息丢掉（不会出现，但保留过滤防御）。
 */
function historyToAgentMessages(history: ChatMessage[], message: string) {
  return [
    ...history
      .filter((item) => {
        if (typeof item.content !== "string") return false;
        // user 端真正空消息丢掉；assistant 端空 content 会被下面替换成占位摘要，不丢。
        if (item.role === "user" && item.content.trim() === "") return false;
        return true;
      })
      .map((item) => ({
        role: item.role,
        content:
          item.role === "assistant" && item.content.trim() === ""
            ? "[此前一回合已生成结构化旅行卡片或完成处理，请勿为该地名重复调用工具。]"
            : item.content,
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
  if (name === "finalizeTripCard") return "行程卡合并";
  if (name === "recommendItinerary") return "行程规划";
  return name;
}

/**
 * 类型守卫：仅匹配会对外下发 tool_start / tool_end 的公开工具名。
 * finalizeTripCard / recommendItinerary 是内部工具，由 chat 路由转成结构化卡片事件，不走这条分支。
 */
function isPublicToolName(name: string): name is "getWeather" | "getAttractions" {
  return name === "getWeather" || name === "getAttractions";
}

/**
 * 把 finalize narrative + weather + attractions 合并成一张 TripCard。
 * - description / summary / chips / recommendation 全部来自 finalize；
 * - hero.city 优先用 weather.location（已校准的官方城市名），weather 缺失时回退到空串（前端会用 hero.regionPath 兜底显示）。
 * - weather 缺失时 card.weather 整段省略，前端 WeatherCard 切到"天气暂不可用"空态。
 * - attractions 数量不一致时以 attractions 为主，description 按索引补齐，越界的保留原值。
 */
function buildTripCard(
  finalize: FinalizeTripCardInput,
  weather: WeatherSnapshot | undefined,
  attractions: Attraction[],
): TripCard {
  const mergedAttractions = attractions.map((attraction, index) => {
    const description = finalize.attractions[index]?.description;
    return description ? { ...attraction, description } : attraction;
  });

  // weather 仅在两端都齐时才落到 card.weather；任一缺失就整段省略。
  const weatherBlock =
    weather && finalize.weather?.summary
      ? { ...weather, summary: finalize.weather.summary }
      : undefined;

  // 复用景点照片做城市 Hero 图：第一张带 imageUrl 的景点最有代表性，零额外 API 调用。
  // 没有任何景点带图时省略 heroImageUrl，前端会走斜纹占位。
  const heroImageUrl = mergedAttractions.find((a) => a.imageUrl)?.imageUrl;

  return {
    hero: {
      regionCode: finalize.hero.regionCode,
      regionPath: finalize.hero.regionPath,
      city: weather?.location ?? "",
      tagline: finalize.hero.tagline,
      verdictBadge: finalize.hero.verdictBadge,
      ...(heroImageUrl ? { heroImageUrl } : {}),
    },
    ...(weatherBlock ? { weather: weatherBlock } : {}),
    attractions: mergedAttractions,
    recommendation: finalize.recommendation,
    chips: finalize.chips,
  };
}

/**
 * finalize 工具 result 做 runtime 宽松校验：Zod 已经在工具内部校过一遍，
 * 这里只防御 "工具抛错 → result 变成错误字符串" 的情况。
 * weather 字段允许缺失（getWeather 失败的兜底路径）。
 */
function isFinalizeInput(value: unknown): value is FinalizeTripCardInput {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<FinalizeTripCardInput>;
  return (
    !!candidate.hero &&
    Array.isArray(candidate.attractions) &&
    !!candidate.recommendation &&
    Array.isArray(candidate.chips)
  );
}

/**
 * recommendItinerary 工具 result 做 runtime 宽松校验。
 * Zod 已经在工具调用前校过一遍；这里只防御工具异常字符串或非预期包装。
 */
function isRecommendItineraryInput(value: unknown): value is RecommendItineraryInput {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RecommendItineraryInput>;
  return (
    typeof candidate.title === "string" &&
    candidate.title.trim().length > 0 &&
    Array.isArray(candidate.days) &&
    candidate.days.length > 0 &&
    candidate.days.every((day) => Array.isArray(day.items) && day.items.length > 0)
  );
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
        if (!name || !isPublicToolName(name)) continue;

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
      if (!toolName || !isPublicToolName(toolName)) {
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
  const abortController = new AbortController();
  const startedToolCalls = new Set<string>();
  const completedToolCalls = new Set<string>();
  // 单轮内每个公开工具最多 emit 一次，防 LLM 抽风时并行调多次同名工具污染前端状态。
  // 例如把上一轮的"上海"和当前"北京"同时发起，前端会基于"最后一次"覆盖，结果数据互相穿插。
  // 只放过第一个 tool_start / tool_end，后续重复 emit 跳过；finalizeTripCard 同理只下发第一张 card。
  const emittedPublicTools = new Set<ToolName>();
  // start 阶段成功 emit 的 run_id；end 阶段以此判断是否要落 cache + emit tool_end。
  // 被 dedup 抑制的 start 对应的 end 也必须丢弃，否则 cache 会被第二次工具结果覆盖。
  const emittedToolStartRunIds = new Set<string>();
  let cardEmitted = false;
  let itineraryEmitted = false;
  // 缓存两个外部工具的裸结果，finalizeTripCard 收尾时用它们拼 TripCard。
  let cachedWeather: WeatherSnapshot | undefined;
  let cachedAttractions: Attraction[] | undefined;
  let sseEventCount = 0;
  let finalContent = "";

  log.request(previewText(input.message));

  // SSE 响应必须绕过 Koa 的 body 管线（不再走 PassThrough → ctx.body 那条路径）：
  // 1) 多一层 PassThrough → pipe(ctx.res) 会把每帧塞进流的内部 buffer，时机不可控；
  // 2) Koa 默认 ctx.respond=true 时会等到处理结束才正确收尾，对长流不友好。
  // 因此这里 ctx.respond=false 自己接管 ctx.res，每帧 emit 后直接走 res.write。
  ctx.respond = false;
  ctx.res.statusCode = 200;
  ctx.res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  ctx.res.setHeader("Cache-Control", "no-cache");
  ctx.res.setHeader("Connection", "keep-alive");
  // Nginx 之类的反向代理会按 X-Accel-Buffering: no 关掉缓冲；不影响本机 dev。
  ctx.res.setHeader("X-Accel-Buffering", "no");
  ctx.res.flushHeaders();
  // 关键修复：关闭响应 socket 上的 Nagle 算法。
  // Node TCP 默认 Nagle 开启（TCP_NODELAY=false），会把多次小写攒成 ~200ms 一个包再下发；
  // 对 SSE 这种"一帧一帧逐次推送"的场景就是灾难——所有事件会被打包到同一个 TCP 包里，
  // 浏览器 DevTools EventStream 看到的就是所有事件时间戳完全相同（ALL 同一毫秒）。
  // setNoDelay(true) 让每个 res.write 立即下发到 socket，事件之间的真实时间差才能体现。
  ctx.res.socket?.setNoDelay(true);

  const emitEvent: EventWriter = (event, data) => {
    if (ctx.res.writableEnded || ctx.res.destroyed) {
      log.warn("SSE 流已关闭，跳过事件推送", {
        event,
        responseDestroyed: ctx.res.destroyed,
        responseWritableEnded: ctx.res.writableEnded,
      });
      return;
    }

    sseEventCount += 1;
    const writable = writeEvent(ctx.res, event, data);
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
    if (!ctx.res.writableEnded) {
      ctx.res.end();
    }
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
      // log.debug('流输出', JSON.stringify(event));
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

      if (event.event === "on_tool_start") {
        // 内部工具不对外暴露 tool_start。
        if (event.name === "finalizeTripCard" || event.name === "recommendItinerary") {
          log.debug("内部工具启动（不下发）", { toolName: event.name, runId: event.run_id });
          continue;
        }
        if (!isPublicToolName(event.name)) {
          continue;
        }
        if (startedToolCalls.has(event.run_id)) {
          continue;
        }
        // 单轮内同名工具最多 emit 一次：LLM 偶尔会并行调多次（譬如混上历史地名），
        // 第二次以后直接吞掉，避免前端基于"最后一次"覆盖、导致 weather/attractions 错位。
        if (emittedPublicTools.has(event.name)) {
          log.warn("同名工具在单轮内被重复触发，已忽略多余调用", {
            toolName: event.name,
            runId: event.run_id,
          });
          startedToolCalls.add(event.run_id);
          continue;
        }

        startedToolCalls.add(event.run_id);
        emittedPublicTools.add(event.name);
        emittedToolStartRunIds.add(event.run_id);
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

      if (event.event === "on_tool_end") {
        // recommendItinerary 结束时：直接 emit 'itinerary'，不再走公开 tool_end。
        if (event.name === "recommendItinerary") {
          if (completedToolCalls.has(event.run_id)) {
            continue;
          }
          completedToolCalls.add(event.run_id);
          // 单轮只允许一张结构化卡片；若 TripCard 已出，itinerary 静默丢弃。
          if (itineraryEmitted || cardEmitted) {
            log.warn("recommendItinerary 在单轮内被重复触发或与 card 冲突，已忽略", {
              runId: event.run_id,
              cardEmitted,
              itineraryEmitted,
            });
            continue;
          }

          const itineraryResult = extractToolResult(event.data?.output);
          if (!isRecommendItineraryInput(itineraryResult)) {
            log.warn("recommendItinerary 返回体不合法，跳过 itinerary 事件", {
              runId: event.run_id,
              preview: previewJson(itineraryResult),
            });
            continue;
          }

          const itinerary: Itinerary = itineraryResult;
          itineraryEmitted = true;
          log.toolResult(toolLabel("recommendItinerary"), {
            toolCallId: event.run_id,
            toolName: "recommendItinerary",
            resultPreview: previewJson({
              title: itinerary.title,
              days: itinerary.days.length,
              hasFootnote: !!itinerary.footnote,
            }),
          });
          emitEvent("itinerary", { itinerary });
          continue;
        }

        // finalizeTripCard 结束时：合并 weather + attractions + narrative，emit 'card'。
        if (event.name === "finalizeTripCard") {
          if (completedToolCalls.has(event.run_id)) {
            continue;
          }
          completedToolCalls.add(event.run_id);
          // 单轮只下发一张 card；LLM 重复调 finalize 时第二次起静默丢弃，
          // 避免前端 card 状态被反复覆盖出现"地点是 A 但景点是 B"的错乱。
          if (cardEmitted || itineraryEmitted) {
            log.warn("finalizeTripCard 在单轮内被重复触发或与 itinerary 冲突，已忽略多余 card", {
              runId: event.run_id,
              cardEmitted,
              itineraryEmitted,
            });
            continue;
          }

          const finalize = extractToolResult(event.data?.output);
          if (!isFinalizeInput(finalize)) {
            log.warn("finalizeTripCard 返回体不合法，跳过 card 合并", {
              runId: event.run_id,
              preview: previewJson(finalize),
            });
            continue;
          }
          if (!cachedAttractions) {
            // attractions 是行程卡的最小必要数据；weather 缺失允许下发 card（前端 WeatherCard 自行降级到空态）。
            log.warn("缺少 attractions 裸数据，无法合并 TripCard", {
              hasWeather: !!cachedWeather,
              hasAttractions: !!cachedAttractions,
            });
            continue;
          }
          if (!cachedWeather) {
            log.debug("getWeather 缺失，按降级模式合并 TripCard（card.weather 将省略）");
          }

          const card = buildTripCard(finalize, cachedWeather, cachedAttractions);
          cardEmitted = true;
          log.toolResult(toolLabel("finalizeTripCard"), {
            toolCallId: event.run_id,
            toolName: "finalizeTripCard",
            resultPreview: previewJson({
              city: card.hero.city,
              verdict: card.hero.verdictBadge,
              attractions: card.attractions.length,
              chips: card.chips.length,
            }),
          });
          emitEvent("card", { card });
          continue;
        }

        if (!isPublicToolName(event.name)) {
          continue;
        }
        if (completedToolCalls.has(event.run_id)) {
          continue;
        }

        completedToolCalls.add(event.run_id);

        // 该 run_id 在 start 阶段被 dedup 抑制了 → end 也跳过，不污染 cache。
        // 否则第二次工具结果（譬如历史地名"上海"的数据）会覆盖第一次（当前"北京"）的 cache。
        if (!emittedToolStartRunIds.has(event.run_id)) {
          log.debug("跳过被去重抑制的 tool_end", {
            toolName: event.name,
            runId: event.run_id,
          });
          continue;
        }

        const result = extractToolResult(event.data?.output);

        // 缓存供 finalizeTripCard 合并时复用；解析失败（如工具抛错导致 result 变成字符串）则不缓存。
        if (event.name === "getWeather" && result && typeof result === "object") {
          cachedWeather = result as WeatherSnapshot;
        } else if (event.name === "getAttractions" && Array.isArray(result)) {
          cachedAttractions = result as Attraction[];
        }

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
    // 自接管 ctx.res 后必须自己 end()——Koa 不会再帮我们收尾。
    if (!ctx.res.writableEnded) {
      ctx.res.end();
    }
  }
}
