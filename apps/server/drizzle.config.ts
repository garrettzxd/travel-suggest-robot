// drizzle-kit 配置：从 schema.ts 读结构、生成 SQL migration 到 drizzle/migrations/。
// pnpm db:generate / db:migrate / db:studio 都依赖本文件。
import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import type { Config } from "drizzle-kit";

const url = process.env.DATABASE_URL ?? "./data/dev.db";
const absPath = isAbsolute(url) ? url : resolve(process.cwd(), url);

// drizzle-kit 不会自动建目录，首次 db:migrate 前需先确保 db 目录存在
mkdirSync(dirname(absPath), { recursive: true });

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle/migrations",
  dialect: "sqlite",
  dbCredentials: { url: absPath },
} satisfies Config;
