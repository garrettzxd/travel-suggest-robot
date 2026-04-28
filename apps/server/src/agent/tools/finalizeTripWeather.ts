// 内部工具：把 getWeather 裸数据总结成 WeatherCard 底部 summary。
// 工具 body 只回吐结构化入参，chat 路由在工具结束时合并天气裸数据并 emit `card_weather`。
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const weatherSummarySchema = z.object({
  summary: z
    .string()
    .min(1)
    .max(160)
    .describe(
      "未来一周天气整体评估，必须基于 getWeather 的真实温度、降水、昼夜温差、风等数据给出穿衣/装备建议，40–120 字。",
    ),
});

/** 天气 summary narrative 入参类型，供 chat 路由运行时判断与合并时复用。 */
export type FinalizeTripWeatherInput = z.infer<typeof weatherSummarySchema>;

export const finalizeTripWeatherTool = tool(
  async (input) => {
    return JSON.stringify(input);
  },
  {
    name: "finalizeTripWeather",
    description:
      "仅当 getWeather 成功返回后调用一次。只生成天气整体评估 summary，必须基于真实天气数据，不要编造天气，也不要生成地点、景点或出行建议字段。",
    schema: weatherSummarySchema,
  },
);
