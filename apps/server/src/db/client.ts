// SQLite + Drizzle 客户端单例。
// 进程内只构造一次：Better-SQLite3 是同步库，连接复用即可，不需要连接池。
// migrate 在 src/index.ts 启动时统一调用，不在本文件内做。
import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { env } from "../env.js";
import * as schema from "./schema.js";

/** 解析 DATABASE_URL 为绝对路径，保证不同 cwd 启动行为一致。 */
function resolveDbPath(url: string): string {
  return isAbsolute(url) ? url : resolve(process.cwd(), url);
}

const dbPath = resolveDbPath(env.DATABASE_URL);

// 数据库文件所在目录可能不存在（首次启动），需要先 mkdir。
mkdirSync(dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);

// WAL 模式：多读少写场景下显著降低锁竞争；同时启用 foreign_keys（SQLite 默认关，cascade 才能生效）。
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

/** 应用全局 drizzle 实例，所有 repo 都从这里 import。 */
export const db = drizzle(sqlite, { schema });

/** 暴露 raw better-sqlite3 句柄，给 migrate 等底层操作使用。 */
export const rawSqlite = sqlite;

export type Db = typeof db;
