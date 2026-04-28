// LangGraph "updates" 流式模式下，从 update chunk 里抽出 tool_calls / ToolMessage
// 转译成 SSE tool_start / tool_end 事件的两个降级辅助函数。
//
// 现状：主链路（route.ts）走的是 `streamEvents({ version: "v2" })` 的 on_tool_start /
// on_tool_end 分支，本文件中两个函数 **未被主链路引用**。保留是为了：
//  - 当 LangGraph events v2 出问题需要快速切回 updates 模式时有现成实现可复用；
//  - 测试场景下需要单独触发 updates 解析时使用。
//
// 修改 handlers.ts 公共工具相关逻辑时，请同步评估是否要更新此处口径。
import type { ToolName } from "@travel/shared";
import type { ChatRouteLogger } from "./logger.js";
import { normalizeToolPayload } from "./streamParsers.js";
import { isPublicToolName, toolLabel } from "./toolMeta.js";
import { previewJson } from "./logger.js";
import type { EventWriter, ToolCall } from "./types.js";

/**
 * 从 LangGraph `updates` 流里抽取 tool_calls 并把每个调用作为一条 tool_start 事件推给前端。
 * 注意：当前未被主链路使用，主链路走 streamEvents 的 on_tool_start。
 */
export function emitToolStarts(
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
export function emitToolEnds(
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
