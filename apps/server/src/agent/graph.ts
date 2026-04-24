// 旅游规划 Agent 的装配：把 LLM、工具集、系统 Prompt 拼成一个可流式消费的 LangGraph。
// 外层通过 `agent.streamEvents(...)` 订阅模型 token、工具开始/结束等事件。
import { createAgent } from "langchain";
import { llm } from "../llm/provider.js";
import { getWeatherTool } from "./tools/getWeather.js";
import { getAttractionsTool } from "./tools/getAttractions.js";
import { TRAVEL_SYSTEM_PROMPT } from "./prompts.js";

export const agent = createAgent({
  model: llm,
  tools: [getWeatherTool, getAttractionsTool],
  systemPrompt: TRAVEL_SYSTEM_PROMPT,
});
