import { env } from "../env.js";
import { qweatherFetch, getQWeatherToken } from "../agent/tools/qweatherAuth.js";

const token = await getQWeatherToken();
console.log("JWT (前 60 字符):", token.slice(0, 60) + "...");

const host = env.QWEATHER_API_HOST;
console.log("\n--- /geo/v2/city/lookup?location=成都 ---");
const geoRes = await qweatherFetch(
  `https://${host}/geo/v2/city/lookup?location=${encodeURIComponent("成都")}`,
);
console.log("status:", geoRes.status);
const geoJson = (await geoRes.json()) as {
  code: string;
  location?: Array<{ id: string; name: string }>;
};
console.log(
  "code:",
  geoJson.code,
  "first city:",
  geoJson.location?.[0]?.name,
  "id:",
  geoJson.location?.[0]?.id,
);

if (geoJson.location?.[0]?.id) {
  const id = geoJson.location[0].id;
  console.log(`\n--- /v7/weather/now?location=${id} ---`);
  const nowRes = await qweatherFetch(`https://${host}/v7/weather/now?location=${id}`);
  const nowJson = (await nowRes.json()) as {
    code: string;
    now?: { temp: string; text: string };
  };
  console.log("code:", nowJson.code, "temp:", nowJson.now?.temp, "text:", nowJson.now?.text);
}
