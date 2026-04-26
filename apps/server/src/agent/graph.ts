// 旅游规划 Agent 的装配：把 LLM、工具集、系统 Prompt 拼成一个可流式消费的 LangGraph。
// 外层通过 `agent.streamEvents(...)` 订阅模型 token、工具开始/结束等事件。
import { createAgent } from "langchain";
import { llm } from "../llm/provider.js";
import { getWeatherTool } from "./tools/getWeather.js";
import { getAttractionsTool } from "./tools/getAttractions.js";
import { finalizeTripCardTool } from "./tools/finalizeTripCard.js";
import { recommendItineraryTool } from "./tools/recommendItinerary.js";
import { TRAVEL_SYSTEM_PROMPT } from "./prompts.js";

// finalizeTripCard / recommendItinerary 是内部工具：不会以 tool_start/tool_end 形式下发给前端，
// 由 chat 路由在工具结束时转换成 card / itinerary 结构化事件。
export const agent = createAgent({
  model: llm,
  tools: [getWeatherTool, getAttractionsTool, finalizeTripCardTool, recommendItineraryTool],
  systemPrompt: TRAVEL_SYSTEM_PROMPT,
});
