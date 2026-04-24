// 进程入口：启动 Koa，并挂上 SIGINT / SIGTERM 的优雅退出。
import { env } from "./env.js";
import { app } from "./app.js";

const server = app.listen(env.PORT, () => {
  console.log(`[server] listening on :${env.PORT}`);
});

/**
 * 优雅关停：先停止接收新连接、等已有请求完成再退出；
 * 10 秒内若还没关完则强制退出，避免悬挂。unref 让定时器不阻塞事件循环。
 */
const shutdown = (signal: string) => {
  console.log(`[server] received ${signal}, shutting down...`);
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
