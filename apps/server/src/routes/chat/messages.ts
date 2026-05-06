// 把对话历史转换成 LangGraph agent 能消费的 messages 数组。
//
// 设计说明（持久化版本）：
// 当前轮的 user message 由 chat 路由在跑 agent 前**先写库**，因此本函数
// 只需把 listMessagesByConversation 拿到的整段历史按时间顺序映射成
// `{role, content}[]` 即可，不需要再额外追加当前轮的 user 输入。
import type { MessageRow } from "../../db/schema.js";

/** 旧 assistant 空内容（仅卡片）的占位摘要——避免 Moonshot 收到空 content 报错。 */
const EMPTY_ASSISTANT_PLACEHOLDER =
  "[此前一回合已生成结构化旅行卡片或完成处理，请勿为该地名重复调用工具。]";

/**
 * 从 DB 加载的历史消息（已按 createdAt 正序）转为 LangGraph 输入。
 *
 * 边界处理：
 * - assistant content === ""（仅卡片回合）：替换为占位摘要，避免空 content 触发模型异常；
 * - user content === ""：理论上 schema 拒绝了 NOT NULL；保留 filter 作为防御。
 */
export function dbMessagesToAgentMessages(rows: MessageRow[]) {
  return rows
    .filter((row) => {
      if (typeof row.content !== "string") return false;
      if (row.role === "user" && row.content.trim() === "") return false;
      return true;
    })
    .map((row) => ({
      role: row.role,
      content:
        row.role === "assistant" && row.content.trim() === ""
          ? EMPTY_ASSISTANT_PLACEHOLDER
          : row.content,
    }));
}
