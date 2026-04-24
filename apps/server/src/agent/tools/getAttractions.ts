// Agent 工具：调用高德地图"搜索 POI 2.0"拿指定地区的主要景点。
// endpoint 使用 v5/place/text（2.0），相较 v3/place/text（1.0）的差异：
//   - `city` → `region` + `city_limit=true`（严格限制在指定区域内）
//   - `offset/page` → `page_size/page_num`
//   - `extensions=all` 弃用，改成按需的 `show_fields=business,photos`
//   - 评分字段从 `biz_ext.rating` 迁到 `business.rating`
// 提供两种查询策略：先按 region 精确查，拿不到再用 "地名+景点" 关键字全国兜底。
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { Attraction } from "@travel/shared";
import { env } from "../../env.js";

/** 高德"搜索 POI 2.0"返回的单条 POI。只列我们当前用到的字段，其余按需再补。 */
interface AmapPoi {
  id: string;
  name: string;
  address?: string;
  /** 一级分类文本，多级用 ";" 分隔，如 "风景名胜;风景名胜;公园"。 */
  type?: string;
  /** "经度,纬度"，小数位 ≤6。 */
  location?: string;
  /** show_fields=business 才会返回。 */
  business?: {
    rating?: string;
    opentime_today?: string;
    tel?: string;
    cost?: string;
  };
  /** show_fields=photos 才会返回；每张图 { title, url }。 */
  photos?: Array<{ title?: string; url?: string }>;
}

interface AmapResponse {
  status: string;
  info?: string;
  infocode?: string;
  count?: string;
  pois?: AmapPoi[];
}

const inputSchema = z.object({
  location: z.string().min(1).describe("城市或地区名称，例如 '成都' 或 'Chengdu'"),
});

/**
 * 把高德原始 POI 精简成前端和模型能直接消费的 Attraction 结构。
 * 只取前 8 条，超出没必要展示；rating 为 NaN（常见于 business 缺失）时置 undefined。
 */
function toAttractions(pois: AmapPoi[] = []): Attraction[] {
  return pois.slice(0, 8).map((poi) => {
    const ratingRaw = poi.business?.rating;
    const rating = ratingRaw ? Number(ratingRaw) : undefined;

    return {
      name: poi.name,
      address: poi.address?.trim() || undefined,
      // 高德的 type 是多级分号分隔，如 "风景名胜;风景名胜;公园"；只取最顶层。
      category: poi.type?.split(";")[0]?.trim() || "景点",
      rating: Number.isFinite(rating) ? rating : undefined,
    };
  });
}

/**
 * 统一调用高德 POI 搜索 2.0 接口并校验业务错误码。
 * 高德返回 HTTP 200 也可能是 status!=="1"，得看 body 里的 status/info/infocode。
 */
async function fetchAmap(url: URL): Promise<AmapPoi[]> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`AMap request failed with status ${response.status}`);
  }

  const data = (await response.json()) as AmapResponse;
  if (data.status !== "1") {
    throw new Error(
      `AMap request failed: ${data.info ?? "unknown error"} (infocode=${data.infocode ?? "n/a"})`,
    );
  }

  return data.pois ?? [];
}

/**
 * 首选策略：用 `region` + `city_limit=true` 严格限定在给定地区内搜"景点"。
 * types=110000 是高德的"旅游景点"一级分类编码。
 * show_fields=business 让返回包含 business.rating，供前端展示评分。
 */
async function queryAttractionsByCity(location: string): Promise<AmapPoi[]> {
  const url = new URL("https://restapi.amap.com/v5/place/text");
  url.searchParams.set("keywords", "景点");
  url.searchParams.set("types", "110000");
  url.searchParams.set("region", location);
  url.searchParams.set("city_limit", "true");
  url.searchParams.set("page_size", "8");
  url.searchParams.set("page_num", "1");
  url.searchParams.set("show_fields", "business");
  url.searchParams.set("key", env.AMAP_KEY);
  return fetchAmap(url);
}

/**
 * 兜底策略：不限 region，用 "<地名>景点" 关键字全国范围搜。
 * 用于精确 region 查不到（如景区、县级行政区、国外地名）的场景。
 */
async function queryAttractionsFallback(location: string): Promise<AmapPoi[]> {
  const url = new URL("https://restapi.amap.com/v5/place/text");
  url.searchParams.set("keywords", `${location}景点`);
  url.searchParams.set("types", "110000");
  url.searchParams.set("page_size", "8");
  url.searchParams.set("page_num", "1");
  url.searchParams.set("show_fields", "business");
  url.searchParams.set("key", env.AMAP_KEY);
  return fetchAmap(url);
}

export const getAttractionsTool = tool(
  async ({ location }) => {
    // 先尝试精确的 region 查询，空集再降级为关键字兜底。
    const cityPois = await queryAttractionsByCity(location);
    const pois = cityPois.length > 0 ? cityPois : await queryAttractionsFallback(location);
    const attractions = toAttractions(pois);

    if (attractions.length === 0) {
      throw new Error(`No attractions found for "${location}"`);
    }

    // 必须序列化成字符串：LangChain 的 OpenAI 兼容转换器遇到数组返回值会把每个元素
    // 当作 content block 透传。对象里没有 `type` 字段，Moonshot 解析时会报
    // "unknown content type:"，导致下一轮请求直接 400。
    return JSON.stringify(attractions);
  },
  {
    name: "getAttractions",
    description:
      "查询指定城市或地区的主要景点（高德地图搜索 POI 2.0）。输入城市或地区名称。",
    schema: inputSchema,
  },
);
