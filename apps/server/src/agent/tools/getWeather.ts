// Agent 工具：查 QWeather 的"实时 + 未来 7 日"天气。先用地名换 city.id，再拉 now/7d。
// 返回 WeatherSnapshot 供模型做输出摘要，数值字段统一转成 Number（QWeather 返回的是字符串）。
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { WeatherSnapshot, WeatherDaily } from "@travel/shared";
import { env } from "../../env.js";
import { qweatherFetch } from "./qweatherAuth.js";
import { explainQWeatherCode, lookupQWeatherCity } from "./qweatherGeo.js";

/** QWeather v7/weather/now 响应体，只列本工具读取的字段。 */
interface QWeatherNowResp {
  code: string;
  now: {
    temp: string;
    text: string;
    windSpeed: string;
    humidity: string;
    windDir: string;
    windScale: string;
    vis: string;
    icon: string;
  };
}

/** QWeather v7/weather/7d 响应体，只列本工具读取的字段。 */
interface QWeatherDailyResp {
  code: string;
  daily: Array<{
    fxDate: string;
    tempMax: string;
    tempMin: string;
    textDay: string;
    precip: string;
    windSpeedDay: string;
    iconDay: string;
  }>;
}

const inputSchema = z.object({
  location: z.string().min(1).describe("城市或地区名称，例如 '成都' 或 'Chengdu'"),
});

/**
 * 查询指定城市的实时天气与未来 7 日预报（和风天气 QWeather）。
 * 返回 {@link WeatherSnapshot}；数值字段统一归一到 number，icon 保留为原始字符串编码。
 */
export const getWeatherTool = tool(
  async ({ location }) => {
    const host = env.QWEATHER_API_HOST;

    // 第一步：地名 → 城市。QWeather 不接受生中文直接查天气，必须先拿到 city.id。
    const city = await lookupQWeatherCity(location);

    // 第二步：实时天气 + 未来 7 日并行拉。QWeather 这两个接口互不依赖，串行只是白等。
    const nowUrl = `https://${host}/v7/weather/now?location=${city.id}`;
    const dailyUrl = `https://${host}/v7/weather/7d?location=${city.id}`;

    const [nowRes, dailyRes] = await Promise.all([qweatherFetch(nowUrl), qweatherFetch(dailyUrl)]);
    const [nowJson, dailyJson] = (await Promise.all([nowRes.json(), dailyRes.json()])) as [
      QWeatherNowResp,
      QWeatherDailyResp,
    ];

    // 必须先校验 QWeather 业务 code：401/402/403 都属于鉴权问题，
    // 这里抛出的错误会沿 chat 路由的 error 事件下发到前端，便于一眼定位。
    if (nowJson.code !== "200") {
      throw new Error(
        `QWeather /v7/weather/now failed (HTTP ${nowRes.status}, code=${nowJson.code}: ${explainQWeatherCode(nowJson.code)})`,
      );
    }
    if (dailyJson.code !== "200") {
      throw new Error(
        `QWeather /v7/weather/7d failed (HTTP ${dailyRes.status}, code=${dailyJson.code}: ${explainQWeatherCode(dailyJson.code)})`,
      );
    }

    // QWeather 数值字段全是字符串，这里统一转 Number 让下游不用重复处理。
    const daily: WeatherDaily[] = dailyJson.daily.map((d) => ({
      date: d.fxDate,
      tMinC: Number(d.tempMin),
      tMaxC: Number(d.tempMax),
      condition: d.textDay,
      precipMm: Number(d.precip),
      iconCode: d.iconDay,
    }));

    const snapshot: WeatherSnapshot = {
      location: city.name,
      lat: city.lat,
      lon: city.lon,
      current: {
        tempC: Number(nowJson.now.temp),
        condition: nowJson.now.text,
        windKph: Number(nowJson.now.windSpeed),
        humidityPct: Number(nowJson.now.humidity),
        windDir: nowJson.now.windDir,
        windScale: nowJson.now.windScale,
        visibilityKm: Number(nowJson.now.vis),
        iconCode: nowJson.now.icon,
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
