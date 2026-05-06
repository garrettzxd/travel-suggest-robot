// Drizzle 表结构定义。SQLite 方言；列上的注释说明边界与生产意图。
// 这里是「持久化层的契约源头」——任何字段调整都要先改这里、再 pnpm db:generate
// 生成 migration、最后让队友 git pull 后由 husky post-merge 自动 db:migrate。
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

/**
 * 用户表。
 * - id 用 nanoid（21 字符，URL 安全），不暴露自增序号
 * - email 唯一，登录主键
 * - passwordHash 是 bcrypt hash，绝不存明文
 * - 时间戳统一用毫秒 Unix integer，与前端 ChatMessage.createdAt 对齐
 */
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  username: text("username").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/**
 * 对话会话表。
 * - 每条消息追加都会刷新 updatedAt，列表按此倒序排
 * - title 默认用首条 user message 截断 30 字（在 conversationRepo 处生成）
 * - userId 上 cascade：删用户连带删其全部对话
 */
export const conversations = sqliteTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => ({
    // (userId, updatedAt) 复合索引：list 接口按 userId 过滤 + updatedAt DESC 排序
    userUpdatedIdx: index("conv_user_updated_idx").on(t.userId, t.updatedAt),
  }),
);

/**
 * 消息表。
 * - role 仅 'user' / 'assistant' 两种
 * - content 文本（assistant 仅卡片回复时可为空字符串）
 * - card / itinerary / transport / food 是 JSON.stringify 后的字符串，反序列化由 repo 处理
 * - 切到 PostgreSQL 时把这 4 列改成 jsonb() 即可，应用层只需调整 repo 序列化
 * - conversationId 上 cascade：删对话连带删其全部消息
 */
export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    content: text("content").notNull(),
    card: text("card"),
    itinerary: text("itinerary"),
    transport: text("transport"),
    food: text("food"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => ({
    // (conversationId, createdAt) 复合索引：详情接口按 conversationId 过滤 + 时间正序读
    convCreatedIdx: index("msg_conv_created_idx").on(t.conversationId, t.createdAt),
  }),
);

/** 行类型导出，给 repo / route 使用。 */
export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type ConversationRow = typeof conversations.$inferSelect;
export type NewConversationRow = typeof conversations.$inferInsert;
export type MessageRow = typeof messages.$inferSelect;
export type NewMessageRow = typeof messages.$inferInsert;
