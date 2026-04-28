// 内部工具：生成景点 description、出行建议与 chips。
// chat 路由在工具结束时把 description 按索引合并进 getAttractions 裸数据，并 emit
// `card_attractions_summary` 事件。
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const attractionsSummarySchema = z.object({
  attractions: z
    .array(
      z.object({
        description: z
          .string()
          .min(1)
          .max(80)
          .describe("一句话景点介绍，突出特色或适合人群，20–60 字。"),
      }),
    )
    .describe(
      "必须与 getAttractions 返回的景点按顺序一一对应；数量也要保持一致（一般 6–8 条）。",
    ),
  recommendation: z.object({
    tag: z
      .string()
      .min(1)
      .describe("顶部 pill 文案，如 '推荐 · 近期出发'、'谨慎 · 建议调整'。"),
    headline: z.string().min(1).describe("建议标题，如 '此刻是否出发'。"),
    body: z
      .string()
      .min(1)
      .max(220)
      .describe(
        "建议正文，结合天气成功时的真实天气或天气失败时的景点/时节给出可执行结论。涉及具体日期请直接用 M/D 格式。",
      ),
  }),
  chips: z
    .array(z.string().min(1))
    .length(4)
    .describe("恰好 4 条后续追问建议，短句 8–18 字。"),
});

/** 景点描述 + 出行建议 narrative 入参类型，供 chat 路由运行时判断与合并时复用。 */
export type FinalizeTripAttractionsSummaryInput = z.infer<typeof attractionsSummarySchema>;

export const finalizeTripAttractionsSummaryTool = tool(
  async (input) => {
    return JSON.stringify(input);
  },
  {
    name: "finalizeTripAttractionsSummary",
    description:
      "当 getAttractions 已返回，且 finalizeTripDestination 已完成后调用一次。生成每个景点的一句话 description、出行建议 recommendation 和 4 条 chips。不要重复生成地点 Hero；天气失败时 recommendation 不要谈天气。",
    schema: attractionsSummarySchema,
  },
);
