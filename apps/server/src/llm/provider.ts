// Moonshot Kimi 作为 Agent 使用的大模型。走 OpenAI 兼容协议，不是新的 Responses API。
import { ChatOpenAI } from "@langchain/openai";
import { env } from "../env.js";

export const llm = new ChatOpenAI({
  model: env.MOONSHOT_MODEL,
  apiKey: env.MOONSHOT_API_KEY,
  // streaming=true 让 LangChain 走 SSE，把 token 一个一个 yield 出来。
  streaming: true,
  // Kimi 尚未支持 Responses API，显式锁 Chat Completions 兼容模式。
  useResponsesApi: false,
  modelKwargs: {
    // Kimi K2.6/K2.5 默认启用 thinking。LangChain 的 OpenAI 兼容消息转换不会保留
    // assistant tool-call 消息里的 reasoning_content，多步工具调用会被 Moonshot 拒绝。
    thinking: { type: "disabled" },
  },
  configuration: {
    baseURL: "https://api.moonshot.cn/v1",
  },
});
