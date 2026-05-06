// 进程入口：先跑 DB migration、再启动 Koa、最后挂上 SIGINT / SIGTERM 的优雅退出。
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { env } from "./env.js";
import { app } from "./app.js";
import { db } from "./db/client.js";

// 启动前自动 migrate：保证容器重启 / git pull 后队友的 DB 跟代码同步。
// migrationsFolder 用相对当前文件的方式定位，避免不同 cwd 启动行为不一致；
// 编译产物在 dist/index.js，drizzle/ 在 dist 同级或父级——这里用 resolve 双层尝试。
function runMigrations(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, "../drizzle/migrations"),       // dev 运行：dist/index.js → ../drizzle/migrations
    resolve(here, "../../drizzle/migrations"),    // 兼容 dist/scripts/x → ../../drizzle/migrations
  ];
  for (const folder of candidates) {
    try {
      migrate(db, { migrationsFolder: folder });
      console.log(`[server] migrations applied from ${folder}`);
      return;
    } catch (err) {
      // 仅当目录不存在 / 内容为空时继续尝试下一个候选；其他错误立即向外抛
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("no such file") && !msg.includes("ENOENT")) {
        throw err;
      }
    }
  }
  throw new Error(
    `[server] drizzle migrations folder not found in any of: ${candidates.join(", ")}`,
  );
}

runMigrations();

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
