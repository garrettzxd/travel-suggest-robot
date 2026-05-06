// users 表数据访问层。所有用户 CRUD 都收敛在这里——路由层只调 repo，不直接写 SQL。
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { AuthUser } from "@travel/shared";
import { db } from "../client.js";
import { users, type UserRow } from "../schema.js";

/** 把 DB 行映射为对外公开的 AuthUser，剥离 passwordHash / updatedAt。 */
export function toAuthUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    createdAt: row.createdAt,
  };
}

/** 按 email 查找用户。返回完整行（含 passwordHash）供登录校验，绝不暴露给前端。 */
export async function findUserByEmail(email: string): Promise<UserRow | undefined> {
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return rows[0];
}

/** 按 id 查找用户。me 接口与未来侧边栏「当前用户」展示使用。 */
export async function findUserById(id: string): Promise<UserRow | undefined> {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0];
}

/**
 * 创建新用户。调用前已经在 register 路由完成 email 唯一性预检与密码 hash。
 * 这里不再做业务校验，仅负责 INSERT 与返回行。
 */
export async function createUser(input: {
  email: string;
  username: string;
  passwordHash: string;
}): Promise<UserRow> {
  const now = Date.now();
  const row: UserRow = {
    id: nanoid(),
    email: input.email,
    username: input.username,
    passwordHash: input.passwordHash,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(users).values(row);
  return row;
}
