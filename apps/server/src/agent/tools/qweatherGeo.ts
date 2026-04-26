// QWeather 城市检索（geo/v2/city/lookup）的共享封装。
// getWeather 需要用它换 city.id 以拉天气；getAttractions 需要用它拿城市中心经纬度，
// 用于把 POI 坐标折算成相对城市中心的 distanceKm。两处都需要地名 → 城市元数据这一步，
// 抽到这里避免逻辑重复，同时让错误信息、QWeather 返回码的处理只维护一份。
import { env } from "../../env.js";
import { qweatherFetch } from "./qweatherAuth.js";

/** 规整后的城市元数据，数值字段已由原始字符串转成 number。 */
export interface QWeatherCity {
  /** QWeather 城市 id，供后续 v7/weather 接口使用 */
  id: string;
  /** 城市显示名 */
  name: string;
  /** 城市中心纬度 */
  lat: number;
  /** 城市中心经度 */
  lon: number;
  /** 省/直辖市名，如 "云南" */
  adm1?: string;
  /** 州/市级行政区名，如 "傣族自治州" */
  adm2?: string;
  /** 国家/地区名，如 "中国" */
  country?: string;
}

/** QWeather geo/v2/city/lookup 返回的原始结构，只列用到的字段。 */
interface QWeatherGeoResp {
  code: string;
  location?: Array<{
    id: string;
    name: string;
    lat: string;
    lon: string;
    adm1?: string;
    adm2?: string;
    country?: string;
  }>;
}

/**
 * QWeather 错误码 → 中文人话提示。仅覆盖最常见的几类，未命中按"未知错误"提示。
 * 401/402/403 都属于鉴权/订阅问题；204 是地名查无；其余多是用法/限流问题。
 */
function explainQWeatherCode(code: string): string {
  switch (code) {
    case "200":
      return "成功";
    case "204":
      return "请求成功但查询结果为空（地名拼写或地区是否支持？）";
    case "400":
      return "请求参数错误（检查 location / 接口路径）";
    case "401":
      return "鉴权失败 — JWT 签名、kid (凭据 ID)、sub (项目 ID) 或 API 域名可能不匹配";
    case "402":
      return "订阅/配额超限 — 检查 QWeather 控制台账户状态";
    case "403":
      return "无权限 — 项目未订阅该数据集，或 API 域名与项目不匹配";
    case "404":
      return "数据不存在";
    case "429":
      return "QPS 超限";
    case "500":
      return "QWeather 服务端错误";
    default:
      return "未知错误，请对照官方错误码表";
  }
}

/**
 * 根据地名查询 QWeather 城市元数据。取返回列表的第一条（与名称最匹配的一条）。
 * @param name 用户输入的地名，中英文均可
 * @returns 规整后的 {@link QWeatherCity}
 * @throws 当 QWeather 没有匹配城市或 code !== "200" 时抛出，错误信息包含 HTTP 状态 / QWeather code / 中文解释
 */
export async function lookupQWeatherCity(name: string): Promise<QWeatherCity> {
  const host = env.QWEATHER_API_HOST;
  const url = `https://${host}/geo/v2/city/lookup?location=${encodeURIComponent(name)}`;
  const res = await qweatherFetch(url);
  const json = (await res.json()) as QWeatherGeoResp;

  // 先看 QWeather 返回 code：!=200 一律视为业务失败，把 HTTP status + code + 解释打进错误消息。
  // 这一步必须在 json.location 检查之前——否则 401 时会被误报成"地名查无"。
  if (json.code !== "200") {
    throw new Error(
      `QWeather geo lookup failed for "${name}" (HTTP ${res.status}, code=${json.code}: ${explainQWeatherCode(json.code)})`,
    );
  }

  const city = json.location?.[0];
  if (!city) {
    throw new Error(`QWeather geo lookup found no match for "${name}" (code=${json.code})`);
  }

  return {
    id: city.id,
    name: city.name,
    lat: Number(city.lat),
    lon: Number(city.lon),
    adm1: city.adm1,
    adm2: city.adm2,
    country: city.country,
  };
}

// 导出给外部诊断使用（getWeather 也复用同一份解释表，避免规则散落）。
export { explainQWeatherCode };
