// 内部工具：把模型生成的逐日行程结构化成 Itinerary。
// 本工具不访问外部实时数据，也不会作为 tool_start/tool_end 下发给前端；
// chat 路由在 on_tool_end:recommendItinerary 时解析返回值并 emit 'itinerary' 事件。
//
// 与 finalizeTripCard 保持一致：工具 body 直接 JSON.stringify 入参。
// 这是为了规避 OpenAI 兼容转换器把对象返回值拆成 content block 后触发 Moonshot
// "unknown content type:" 的问题。
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const itineraryItemSchema = z.object({
  time: z
    .string()
    .min(1)
    .max(12)
    .optional()
    .describe(
      "时段或宽口径时间，如 '上午'、'下午'、'傍晚'、'晚上'、'或'。优先用宽口径，避免编造精确时刻。",
    ),
  title: z
    .string()
    .min(1)
    .max(80)
    .describe("主活动标题，如 '断桥残雪 → 白堤 → 平湖秋月'。"),
  tag: z
    .string()
    .min(1)
    .max(8)
    .optional()
    .describe("右侧短标签，如 '步行'、'船游'、'人文'、'城市漫步'。不要超过 8 个字。"),
  desc: z
    .string()
    .min(1)
    .max(180)
    .describe(
      "一句话补充路线、节奏、时长或注意事项。不要编造门票价格、酒店名称、班次时刻等动态数据。",
    ),
});

const itineraryDaySchema = z.object({
  subtitle: z
    .string()
    .min(1)
    .max(32)
    .optional()
    .describe("当天主题副标题，如 '西湖核心区'、'灵隐 + 西溪 / 龙井'。"),
  items: z
    .array(itineraryItemSchema)
    .min(1)
    .max(8)
    .describe("当天时间轴条目，建议 2–5 条；备选活动用 time: '或'。"),
});

const itinerarySchema = z.object({
  title: z
    .string()
    .min(1)
    .max(60)
    .describe("卡片标题，如 '5/1 三天两晚 · 杭州行程'，需包含目的地和天数。"),
  days: z
    .array(itineraryDaySchema)
    .min(1)
    .max(5)
    .describe("逐日行程，长度等于总天数，建议 1–5 天。"),
  footnote: z
    .string()
    .min(1)
    .max(220)
    .optional()
    .describe(
      "底部提示区文案，可写人流、交通、老人/亲子适配、替代路线等。不要编造实时价格或班次。",
    ),
});

/** recommendItinerary 工具入参类型，供 chat 路由做运行时结构判断时复用。 */
export type RecommendItineraryInput = z.infer<typeof itinerarySchema>;

/**
 * 把已经通过 Zod 校验的行程规划入参原样序列化。
 * @param input 模型按 Itinerary schema 填充的结构化行程
 * @returns JSON 字符串，供 chat 路由解析并下发给前端
 */
async function serializeItineraryInput(input: RecommendItineraryInput): Promise<string> {
  return JSON.stringify(input);
}

export const recommendItineraryTool = tool(serializeItineraryInput, {
  name: "recommendItinerary",
  description:
    "当且仅当用户明确要求为单一目的地规划行程、安排几天怎么玩、三天两晚/四天路线等编排类问题时调用一次。不要查询天气或实时价格；不要编造酒店、票价、班次；不熟悉的小众目的地不要虚构景点。",
  schema: itinerarySchema,
});
