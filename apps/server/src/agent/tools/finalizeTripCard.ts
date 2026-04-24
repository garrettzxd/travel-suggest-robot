// 内部工具：把 getWeather / getAttractions 拿到的裸数据 + LLM 生成的 narrative
// 一次性打包成一张 TripCard。本工具只负责"收集 narrative 字段"，真正的数据合并
// 由 apps/server/src/routes/chat.ts 在 on_tool_end:finalizeTripCard 时做，并向前端
// emit 'card' 事件——所以工具 body 直接把入参 JSON.stringify 后 return 即可。
//
// LangChain 的 OpenAI 兼容转换器处理对象返回值时会把每个字段当作 content block
// 透传；缺 `type` 字段时 Moonshot 会报 "unknown content type:"。因此即便本工具的
// 返回值只给 chat 路由消费（不会再进 LLM），也统一序列化成字符串保持口径一致。
import { tool } from "@langchain/core/tools";
import { z } from "zod";

/**
 * finalizeTripCard 的 narrative schema：
 * - hero.tagline / regionCode / regionPath / verdictBadge：地点卡文案；
 * - weather.summary：天气卡底部的"整体评估"；
 * - attractions[].description：必须按 getAttractions 返回的景点顺序一一对应；
 * - recommendation：出行建议面板文案（tag / headline / body）；
 * - chips：恰好 4 条后续追问建议。
 *
 * 工具本身不校验业务一致性（比如 description 长度匹配 attractions 数量），
 * 由后端路由在合并时做宽松匹配。Zod 只保证结构与枚举。
 */
const finalizeSchema = z.object({
  hero: z.object({
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
      .describe("一句城市印象，12–28 字，如 '热带雨林、傣族风情与澜沧江落日的交汇处'。"),
    verdictBadge: z
      .enum(["good", "caution", "avoid"])
      .describe("整体出行评估：good=适合出行 / caution=谨慎出行 / avoid=不建议出行。"),
  }),
  weather: z.object({
    summary: z
      .string()
      .min(1)
      .describe(
        "未来一周天气整体评估，结合温度区间、降水与昼夜温差给出穿衣/装备建议，40–120 字。",
      ),
  }),
  attractions: z
    .array(
      z.object({
        description: z
          .string()
          .min(1)
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
      .describe("顶部 pill 文案，如 '推荐 · 近期出发' 或 '谨慎 · 建议调整'。"),
    headline: z.string().min(1).describe("建议标题，如 '此刻是否出发'。"),
    body: z
      .string()
      .min(1)
      .describe(
        "建议正文，结合时节与天气给出可执行结论。涉及具体日期请直接用 M/D 格式（前端会做高亮）。",
      ),
  }),
  chips: z
    .array(z.string().min(1))
    .length(4)
    .describe(
      "恰好 4 条后续追问建议，短句 8–18 字，如 '4/26 改为室内有什么好去处？'。",
    ),
});

/** Zod 解出的 narrative 入参类型，供 chat 路由合并时复用。 */
export type FinalizeTripCardInput = z.infer<typeof finalizeSchema>;

export const finalizeTripCardTool = tool(
  async (input) => {
    // 工具只做"收集"，真正合并发生在 chat 路由，此处直接把结构化入参回吐。
    // 必须 stringify：见顶部注释关于 Moonshot content block 的限制。
    return JSON.stringify(input);
  },
  {
    name: "finalizeTripCard",
    description:
      "当且仅当 getWeather 和 getAttractions 都已返回后调用一次，把地点 narrative、天气总结、每个景点的一句话描述、出行建议和 4 条后续追问打包成行程卡 narrative。不要重复调用，也不要在天气或景点工具之前调用。",
    schema: finalizeSchema,
  },
);
