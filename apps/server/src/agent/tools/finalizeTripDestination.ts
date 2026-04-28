// 内部工具：把 TripCard 顶部地点 Hero 的 narrative 拆成独立小结构。
// 本工具不访问外部实时数据，也不会作为 tool_start/tool_end 下发给前端；
// chat 路由在 on_tool_end:finalizeTripDestination 时补 city / heroImageUrl 后 emit
// `card_destination` 事件，让前端先填充地点卡。
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const destinationSchema = z.object({
  regionCode: z
    .string()
    .min(1)
    .describe(
      "省/大区代码或缩写，大写字母，如 'YN'（云南）、'JP-TOHOKU'（日本东北）。无对应代码时用拼音首字母。",
    ),
  regionPath: z
    .string()
    .min(1)
    .describe("行政区或地理层级链，如 '云南省 · 傣族自治州'、'日本 · 东北地方'。"),
  tagline: z
    .string()
    .min(1)
    .max(40)
    .describe("一句城市印象，12–28 字，如 '热带雨林、傣族风情与澜沧江落日的交汇处'。"),
  verdictBadge: z
    .enum(["good", "caution", "avoid"])
    .describe("整体出行评估：good=适合出行 / caution=谨慎出行 / avoid=不建议出行。"),
});

/** 地点 Hero narrative 入参类型，供 chat 路由运行时判断与合并时复用。 */
export type FinalizeTripDestinationInput = z.infer<typeof destinationSchema>;

export const finalizeTripDestinationTool = tool(
  async (input) => {
    return JSON.stringify(input);
  },
  {
    name: "finalizeTripDestination",
    description:
      "当 getWeather 和 getAttractions 都已返回，且本轮需要 TripCard 时调用一次。只生成地点 Hero narrative：regionCode、regionPath、tagline、verdictBadge。不要生成天气总结、景点描述、出行建议或 chips。",
    schema: destinationSchema,
  },
);
