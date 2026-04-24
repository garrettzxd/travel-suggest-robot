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
 * 根据地名查询 QWeather 城市元数据。取返回列表的第一条（与名称最匹配的一条）。
 * @param name 用户输入的地名，中英文均可
 * @returns 规整后的 {@link QWeatherCity}
 * @throws 当 QWeather 没有匹配城市时抛出，错误信息附带 code 便于查官方码表
 */
export async function lookupQWeatherCity(name: string): Promise<QWeatherCity> {
  const host = env.QWEATHER_API_HOST;
  const url = `https://${host}/geo/v2/city/lookup?location=${encodeURIComponent(name)}`;
  const res = await qweatherFetch(url);
  const json = (await res.json()) as QWeatherGeoResp;

  const city = json.location?.[0];
  if (!city) {
    // 把 QWeather 的 code 回显到错误信息里，便于对照官方错误码表排查。
    throw new Error(`QWeather geo lookup failed for "${name}" (code=${json.code})`);
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
