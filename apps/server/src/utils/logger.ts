// 全局 pino 日志 root。所有模块应 `rootLogger.child({ module: "..." })` 派生子 logger，
// 不要直接 pino() 另起一个，避免等级和 transport 配置发散。
import pino from "pino";
import { env } from "../env.js";

// TTY 下启用 pino-pretty 便于本地阅读；管道/生产环境保持 NDJSON 以便日志采集。
const usePretty = process.stdout.isTTY;

export const rootLogger = pino({
  level: env.LOG_LEVEL,
  ...(usePretty
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:HH:MM:ss.l",
            ignore: "pid,hostname",
            messageFormat: "{module} | {msg}",
          },
        },
      }
    : {}),
});
