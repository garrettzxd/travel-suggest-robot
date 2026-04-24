// Agent 工具：查 QWeather 的"实时 + 未来 7 日"天气。先用地名换 city.id，再拉 now/7d。
// 返回 WeatherSnapshot 供模型做输出摘要，数值字段统一转成 Number（QWeather 返回的是字符串）。
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { WeatherSnapshot, WeatherDaily } from "@travel/shared";
import { env } from "../../env.js";
import { qweatherFetch } from "./qweatherAuth.js";

interface GeoCity {
  id: string;
  name: string;
  lat: string;
  lon: string;
}

interface QWeatherNowResp {
  code: string;
  now: {
    temp: string;
    text: string;
    windSpeed: string;
  };
}

interface QWeatherDailyResp {
  code: string;
  daily: Array<{
    fxDate: string;
    tempMax: string;
    tempMin: string;
    textDay: string;
    precip: string;
    windSpeedDay: string;
  }>;
}

interface QWeatherGeoResp {
  code: string;
  location?: GeoCity[];
}

const inputSchema = z.object({
  location: z.string().min(1).describe("城市或地区名称，例如 '成都' 或 'Chengdu'"),
});

export const getWeatherTool = tool(
  async ({ location }) => {
    const host = env.QWEATHER_API_HOST;

    // 第一步：地名 → 城市。QWeather 不接受生中文直接查天气，必须先拿到 city.id。
    const geoUrl = `https://${host}/geo/v2/city/lookup?location=${encodeURIComponent(location)}`;
    const geoRes = await qweatherFetch(geoUrl);
    const geoJson = (await geoRes.json()) as QWeatherGeoResp;

    const city = geoJson.location?.[0];
    if (!city) {
      // 把 QWeather 的 code 回显到错误信息里，便于对照官方错误码表排查。
      throw new Error(`QWeather geo lookup failed for "${location}" (code=${geoJson.code})`);
    }
    const lat = Number(city.lat);
    const lon = Number(city.lon);

    // 第二步：实时天气 + 未来 7 日并行拉。QWeather 这两个接口互不依赖，串行只是白等。
    const nowUrl = `https://${host}/v7/weather/now?location=${city.id}`;
    const dailyUrl = `https://${host}/v7/weather/7d?location=${city.id}`;

    const [nowRes, dailyRes] = await Promise.all([qweatherFetch(nowUrl), qweatherFetch(dailyUrl)]);
    const [nowJson, dailyJson] = (await Promise.all([nowRes.json(), dailyRes.json()])) as [
      QWeatherNowResp,
      QWeatherDailyResp,
    ];

    // QWeather 数值字段全是字符串，这里统一转 Number 让下游不用重复处理。
    const daily: WeatherDaily[] = dailyJson.daily.map((d) => ({
      date: d.fxDate,
      tMinC: Number(d.tempMin),
      tMaxC: Number(d.tempMax),
      condition: d.textDay,
      precipMm: Number(d.precip),
    }));

    const snapshot: WeatherSnapshot = {
      location: city.name,
      lat,
      lon,
      current: {
        tempC: Number(nowJson.now.temp),
        condition: nowJson.now.text,
        windKph: Number(nowJson.now.windSpeed),
      },
      daily,
    };

    return snapshot;
  },
  {
    name: "getWeather",
    description:
      "查询指定城市/地区的实时天气和未来 7 日天气（和风天气 QWeather）。输入城市或地区名称。",
    schema: inputSchema,
  },
);
