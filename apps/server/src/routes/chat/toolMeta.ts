// 工具名相关的元信息：中文别名、公开/内部工具识别、内部工具返回体的运行时校验。
import type { ToolName } from "@travel/shared";
import type { FinalizeTripCardInput } from "../../agent/tools/finalizeTripCard.js";
import type { RecommendItineraryInput } from "../../agent/tools/recommendItinerary.js";

/** 日志中展示的工具别名（中文），找不到就回退原始英文名。 */
export function toolLabel(name: ToolName): string {
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
export function isPublicToolName(name: string): name is "getWeather" | "getAttractions" {
  return name === "getWeather" || name === "getAttractions";
}

/**
 * finalize 工具 result 做 runtime 宽松校验：Zod 已经在工具内部校过一遍，
 * 这里只防御 "工具抛错 → result 变成错误字符串" 的情况。
 * weather 字段允许缺失（getWeather 失败的兜底路径）。
 */
export function isFinalizeInput(value: unknown): value is FinalizeTripCardInput {
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
export function isRecommendItineraryInput(value: unknown): value is RecommendItineraryInput {
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
