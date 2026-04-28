// 把前端历史消息转换成 LangGraph agent 能消费的 messages 数组。
import type { ChatMessage } from "@travel/shared";

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
export function historyToAgentMessages(history: ChatMessage[], message: string) {
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
