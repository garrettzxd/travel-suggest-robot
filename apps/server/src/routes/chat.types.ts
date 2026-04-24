// chat 路由的 Zod 校验 schema 与共享类型。放单独文件避免 chat.ts 顶部过长。
import { z } from "zod";

/** POST /api/chat 的请求体。history 允许缺省为空数组，避免首轮对话被挡。 */
export const ChatRequestSchema = z.object({
  message: z.string().min(1),
  history: z
    .array(
      z.object({
        id: z.string().min(1),
        role: z.enum(["user", "assistant"]),
        content: z.string(),
        createdAt: z.number(),
      }),
    )
    .default([]),
});

// LangGraph 流式 message chunk 附带的元信息，langgraph_node 标识产出该 chunk 的节点。
// createAgent 当前模型节点通常是 "model_request"，不能写死只接受 "model"。
export interface StreamMetadata {
  langgraph_node?: string;
}

// 大模型要求调用工具时的单条 tool_call 结构。
export interface ToolCall {
  id?: string;
  name?: string;
  args?: unknown;
}

export type EventWriter = (
  event: string,
  data: unknown,
  extra?: Record<string, unknown>,
) => void;
