// 用 zod 校验进程环境变量：缺失或非法立刻 exit(1)，避免应用带病启动。
// 所有模块统一从这里 import `env`，不要直接读 process.env。
import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  CORS_ORIGIN: z.string().min(1),
  MOONSHOT_API_KEY: z.string().min(1),
  MOONSHOT_MODEL: z.string().min(1).default("kimi-k2.6"),
  QWEATHER_API_HOST: z.string().min(1).default("nq3dmvcxr5.re.qweatherapi.com"),
  QWEATHER_PROJECT_ID: z.string().min(1).describe("QWeather 项目 ID，作为 JWT sub"),
  QWEATHER_KEY_ID: z.string().min(1).describe("QWeather 凭据 ID，作为 JWT header.kid"),
  QWEATHER_PRIVATE_KEY_PATH: z
    .string()
    .min(1)
    .describe("Ed25519 PEM (PKCS8) 私钥文件路径"),
  AMAP_KEY: z.string().min(1),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("[env] Invalid environment variables:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
