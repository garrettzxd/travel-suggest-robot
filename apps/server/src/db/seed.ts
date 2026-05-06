// 开发 / CI 用的幂等种子数据。生产环境绝不调用。
// 使用 onConflictDoNothing() 保证可重复执行：跑多少次结果都一样，不会重复插入。
// 入口：pnpm db:seed（也是 db:reset 流程的一部分）
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { db } from "./client.js";
import { users, conversations, messages } from "./schema.js";

/** 主流程：插入两个测试用户 + 一条样例对话 + 两条样例消息。 */
async function main() {
  const now = Date.now();
  const aliceId = "user-seed-alice";
  const bobId = "user-seed-bob";
  const convId = "conv-seed-1";

  // bcrypt rounds=10 是 bcryptjs 的安全 / 性能默认平衡点
  const password = await bcrypt.hash("password123", 10);

  await db
    .insert(users)
    .values([
      {
        id: aliceId,
        email: "alice@test.com",
        username: "alice",
        passwordHash: password,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: bobId,
        email: "bob@test.com",
        username: "bob",
        passwordHash: password,
        createdAt: now,
        updatedAt: now,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(conversations)
    .values({
      id: convId,
      userId: aliceId,
      title: "示例对话：北京三日游",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();

  await db
    .insert(messages)
    .values([
      {
        id: nanoid(),
        conversationId: convId,
        role: "user",
        content: "我想去北京玩三天，帮我安排一下",
        createdAt: now,
      },
      {
        id: nanoid(),
        conversationId: convId,
        role: "assistant",
        content: "好的，北京三日游推荐如下……（占位）",
        createdAt: now + 1,
      },
    ])
    .onConflictDoNothing();

  // 控制台直出便于 CI 日志查看
  console.log("[seed] done. users: alice@test.com / bob@test.com (password: password123)");
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
