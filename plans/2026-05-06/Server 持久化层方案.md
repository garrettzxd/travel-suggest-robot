# Server 持久化层方案：SQLite + Drizzle + JWT

## Context

当前 travel-suggest-robot 是完全无状态的 SSE 聊天服务：

- **无数据库**：`apps/server/package.json` 没有任何 DB 依赖；`apps/server/src/index.ts` 启动入口直接 `app.listen`，无任何持久化初始化 hook。
- **无登录态**：唯一接口 `POST /api/chat` 不做身份校验。
- **历史靠前端**：`apps/web/src/chat/useTravelAgent.ts` 在内存维护 messages，每轮通过 `ChatRequest.history` 上传，刷新即丢。

为支持「用户系统 + 历史对话」，需在 server 引入持久化层。本方案确定：

- **存储**：SQLite + Drizzle ORM（迁移到 PG 仅需换 driver）
- **登录态**：jose 签发 HS256 JWT，存 httpOnly Cookie
- **注册**：邮箱 + 密码即注册即用，无邮箱验证
- **History 加载**：前端只传 `conversationId`，服务端从 messages 表读取历史

预期产出：用户可注册登录、聊天记录持久化、刷新页面可恢复历史会话、多设备登录共享同一份对话。

---

## 1. 依赖与目录调整

### 1.1 新增依赖（apps/server）

```json
{
  "dependencies": {
    "drizzle-orm": "^0.36.0",
    "better-sqlite3": "^11.3.0",
    "bcryptjs": "^2.4.3",
    "@koa/router": "*",
    "koa-cookie": "^1.0.0",
    "nanoid": "^5.0.0"
    // jose 已存在，复用
  },
  "devDependencies": {
    "drizzle-kit": "^0.28.0",
    "@types/better-sqlite3": "^7.6.11",
    "@types/bcryptjs": "^2.4.6"
  }
}
```

> 注：`@koa/router` 应该已装。`koa-cookie` 可选——Koa 自带 `ctx.cookies.get/set`，**实际可不装**，下方 auth 中间件直接用 ctx.cookies。

### 1.2 新增/修改文件清单

```
apps/server/
├── drizzle.config.ts                    [新增] drizzle-kit 配置
├── drizzle/
│   └── migrations/                      [新增] 自动生成的 SQL migration（进 git）
├── src/
│   ├── db/
│   │   ├── client.ts                    [新增] better-sqlite3 + drizzle 实例
│   │   ├── schema.ts                    [新增] 三张表的 Drizzle schema
│   │   ├── seed.ts                      [新增] 幂等种子数据（开发/CI）
│   │   └── repositories/
│   │       ├── userRepo.ts              [新增] 用户相关 DB 操作
│   │       ├── conversationRepo.ts      [新增] 对话 CRUD
│   │       └── messageRepo.ts           [新增] 消息 CRUD
│   ├── auth/
│   │   ├── jwt.ts                       [新增] jose 签发/验签 HS256 JWT
│   │   ├── password.ts                  [新增] bcrypt hash/compare
│   │   └── middleware.ts                [新增] 鉴权中间件
│   ├── routes/
│   │   ├── auth/
│   │   │   ├── index.ts                 [新增] 路由 barrel
│   │   │   ├── register.ts              [新增] POST /api/auth/register
│   │   │   ├── login.ts                 [新增] POST /api/auth/login
│   │   │   ├── logout.ts                [新增] POST /api/auth/logout
│   │   │   └── me.ts                    [新增] GET  /api/auth/me
│   │   ├── conversations/
│   │   │   ├── index.ts                 [新增] 路由 barrel
│   │   │   ├── list.ts                  [新增] GET  /api/conversations
│   │   │   ├── create.ts                [新增] POST /api/conversations
│   │   │   ├── detail.ts                [新增] GET  /api/conversations/:id
│   │   │   └── delete.ts                [新增] DELETE /api/conversations/:id
│   │   └── chat/
│   │       ├── route.ts                 [改动] 注入 auth、加载 history、流后落库
│   │       ├── messages.ts              [改动] 接受 server-loaded history
│   │       ├── handlers.ts              [改动] 在 short-circuit 路径暴露持久化 hook
│   │       └── types.ts                 [改动] ChatRequestSchema 字段调整
│   ├── app.ts                           [改动] 装配 auth 路由 + conversations 路由 + auth 中间件
│   ├── env.ts                           [改动] 新增 DATABASE_URL / JWT_SECRET / COOKIE_NAME
│   └── index.ts                         [改动] 启动时自动 migrate

packages/shared/src/
├── auth.ts                              [新增] User / Login/Register Request 等类型
├── conversation.ts                      [新增] Conversation / 列表分页等类型
├── chat.ts                              [改动] ChatRequest 加 conversationId、新 SSE 事件
└── index.ts                             [改动] barrel 导出新模块
```

---

## 2. 数据模型设计

`apps/server/src/db/schema.ts`：

```ts
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

/** 用户：邮箱唯一、密码 bcrypt hash 持久化。 */
export const users = sqliteTable('users', {
  id:           text('id').primaryKey(),                  // nanoid
  email:        text('email').notNull().unique(),         // 登录主键
  username:     text('username').notNull(),               // 显示名
  passwordHash: text('password_hash').notNull(),          // bcrypt hash
  createdAt:    integer('created_at').notNull(),          // 毫秒时间戳
  updatedAt:    integer('updated_at').notNull(),
});

/** 对话会话：每用户多对话，最近活跃排序。 */
export const conversations = sqliteTable('conversations', {
  id:        text('id').primaryKey(),                     // nanoid
  userId:    text('user_id').notNull()
              .references(() => users.id, { onDelete: 'cascade' }),
  title:     text('title').notNull(),                     // 用第一条 user message 截断 30 字
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),             // 每条新消息触发更新，列表按此排序
}, (t) => ({
  userUpdatedIdx: index('conv_user_updated_idx').on(t.userId, t.updatedAt),
}));

/** 消息：role + content + 可选 card / itinerary（JSON 字符串）。 */
export const messages = sqliteTable('messages', {
  id:             text('id').primaryKey(),                // nanoid
  conversationId: text('conversation_id').notNull()
                    .references(() => conversations.id, { onDelete: 'cascade' }),
  role:           text('role', { enum: ['user', 'assistant'] }).notNull(),
  content:        text('content').notNull(),              // 文本内容（assistant 卡片消息可为空字符串）
  card:           text('card'),                           // JSON.stringify(TripCard) | null
  itinerary:      text('itinerary'),                      // JSON.stringify(Itinerary) | null
  transport:      text('transport'),                      // JSON.stringify(TransportPlan) | null
  food:           text('food'),                           // JSON.stringify(FoodRecommendation) | null
  createdAt:      integer('created_at').notNull(),
}, (t) => ({
  convCreatedIdx: index('msg_conv_created_idx').on(t.conversationId, t.createdAt),
}));
```

**设计要点：**

- **id 用 nanoid**：URL 安全、短、无序号枚举风险
- **时间戳用 integer 毫秒**：与 shared `ChatMessage.createdAt` 一致，前端无需转换
- **结构化卡片用 TEXT (JSON)**：SQLite 无 JSONB；切换 PG 时把列改 `jsonb()` 即可
- **Cascade 删除**：删用户连带删对话、删对话连带删消息，避免孤儿
- **复合索引**：`(userId, updatedAt)` 支撑列表按时间倒序、`(conversationId, createdAt)` 支撑详情按时间正序

---

## 3. 登录态校验

### 3.1 JWT 签发 / 验签（apps/server/src/auth/jwt.ts）

复用项目已装的 `jose` 库（之前用于 QWeather）：

```ts
import { SignJWT, jwtVerify } from 'jose';

const secret = new TextEncoder().encode(env.JWT_SECRET);

/** 签发 30 天有效期的访问 token。payload 含 userId / email。 */
export async function signAuthToken(userId: string, email: string): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secret);
}

/** 验签 + 解析；失败抛错。 */
export async function verifyAuthToken(token: string): Promise<{ userId: string; email: string }> {
  const { payload } = await jwtVerify(token, secret);
  return { userId: String(payload.sub), email: String(payload.email) };
}
```

### 3.2 鉴权中间件（apps/server/src/auth/middleware.ts）

```ts
/**
 * 校验 httpOnly Cookie 中的 JWT，注入 ctx.state.userId。
 * 失败时直接 401；不抛异常给外层。
 */
export async function authRequired(ctx: Context, next: Next): Promise<void> {
  const token = ctx.cookies.get(env.COOKIE_NAME);
  if (!token) {
    ctx.status = 401;
    ctx.body = { message: 'Unauthorized: missing token' };
    return;
  }
  try {
    const { userId, email } = await verifyAuthToken(token);
    ctx.state.userId = userId;
    ctx.state.userEmail = email;
    await next();
  } catch {
    ctx.status = 401;
    ctx.body = { message: 'Unauthorized: invalid token' };
  }
}
```

### 3.3 Cookie 设置策略

登录成功时：

```ts
ctx.cookies.set(env.COOKIE_NAME, token, {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',  // 本地 http 时需 false 才能写入
  sameSite: 'lax',                         // 配合 CORS credentials 使用
  maxAge: 30 * 24 * 60 * 60 * 1000,        // 30 天，与 JWT 过期对齐
  path: '/',
});
```

> **Koa keys 配置**：在 `apps/server/src/app.ts` 中需设 `app.keys = [env.JWT_SECRET]`，才能让 `ctx.cookies.set` 启用签名（即使我们的 token 自己签名，Koa 仍要求 keys）。

### 3.4 SSE + Cookie 协作

由于 `apps/web/src/api/client.ts` 用 `fetch()` 而非 `EventSource`，浏览器会自动带 Cookie（已有 `credentials: true`），无需额外处理。**前端的唯一改动是 `fetch` 时加 `credentials: 'include'`**——这块写在「现有接口改动」中。

---

## 4. 新增接口

所有响应均为 JSON，统一错误格式：`{ message: string, code?: string }`。

### 4.1 认证模块（无需 auth 中间件）

#### POST /api/auth/register

```
Request:  { email: string, username: string, password: string }
          - email: 简单 email 格式校验
          - password: 至少 8 位
Response: 201 + Set-Cookie + { user: { id, email, username, createdAt } }
Errors:   400 字段非法 / 409 邮箱已存在
```

逻辑：邮箱唯一性检查 → bcrypt hash → INSERT user → 签 JWT → 设 Cookie。

#### POST /api/auth/login

```
Request:  { email: string, password: string }
Response: 200 + Set-Cookie + { user: { id, email, username, createdAt } }
Errors:   400 字段非法 / 401 邮箱或密码错误（统一文案，不区分）
```

#### POST /api/auth/logout

```
Request:  无
Response: 204
```

仅清除 Cookie：`ctx.cookies.set(env.COOKIE_NAME, null, { maxAge: 0 })`。无需 server-side 黑名单（JWT 无状态，前端拿不到 Cookie 即失效）。

#### GET /api/auth/me（需 auth）

```
Response: 200 { user: { id, email, username, createdAt } }
Errors:   401 未登录
```

供前端启动时调一次以恢复登录态。

### 4.2 对话历史模块（全部需 auth）

#### GET /api/conversations

```
Query:    无
Response: { items: ConversationListItem[] }
```

固定返回最近 20 条，`ORDER BY updatedAt DESC LIMIT 20`。items 只含摘要字段（id / title / updatedAt / lastMessagePreview）不含完整消息。

> **设计简化说明**：MVP 阶段不做分页 / cursor，超过 20 条对话的用户后续再加「加载更多」。这样前端列表组件、API 契约都更简单，避免过早抽象。

#### POST /api/conversations

```
Request:  { title?: string }
Response: 201 { conversation: { id, title, createdAt, updatedAt } }
```

显式建空对话（可选——`POST /api/chat` 也会按需创建）。

#### GET /api/conversations/:id

```
Response: 200 {
  conversation: { id, title, createdAt, updatedAt },
  messages: ChatMessageWithCards[]      // 含 card / itinerary 反序列化对象
}
Errors:   401 / 404 (含归属权校验：仅本人可读)
```

> **归属权**：所有 `:id` 接口都需 `WHERE userId = ctx.state.userId`，404 而非 403，避免泄露 id 存在性。

#### DELETE /api/conversations/:id

```
Response: 204
Errors:   401 / 404
```

依赖 schema 的 cascade 自动删 messages。

---

## 5. 现有接口改动

### 5.1 POST /api/chat

**改动 1：增加 auth 中间件 + conversationId 字段**

```ts
// types.ts —— ChatRequestSchema
export const ChatRequestSchema = z.object({
  message: z.string().min(1),
  conversationId: z.string().min(1).optional(),  // 不传 = 新建对话
  // history 字段移除（服务端从 DB 加载）
});
```

**改动 2：route.ts 流程重排**

```
auth 中间件已注入 ctx.state.userId
  ↓
1. ChatRequestSchema 校验
2. resolveConversation(userId, conversationId)
   - 有 id：SELECT + 校验归属，404 时 throw
   - 无 id：INSERT 新对话（title 暂用 message 截断 30 字）→ 返回 newId
3. 立刻 emitEvent('conversation', { conversationId, isNew })
   ↑ 让前端首屏就能拿到 id 写进 URL
4. INSERT user message（content=input.message, createdAt=Date.now()）
5. SELECT 历史消息 → 转 LangGraph messages（替代 historyToAgentMessages）
6. 跑现有 LangGraph 流（不变）
7. finally 块新增：
   - 如果 state.finalContent / state.cachedHero / state.cachedWeatherWithSummary
     / state.cachedAttractionsWithDescriptions / state.cachedRecommendation
     / state.cachedChips 任一非空，合成最终 TripCard / Itinerary 字段
   - INSERT assistant message（content, card, itinerary, transport, food）
   - UPDATE conversations.updatedAt = now
```

**改动 3：messages.ts**

把 `historyToAgentMessages(history: ChatMessage[], message: string)` 改为：

```ts
/**
 * 从 DB 加载的 messages 转为 LangGraph 输入。
 * 注意：当前轮的 user message 已先 INSERT 进 DB，所以无需额外追加。
 */
export function dbMessagesToAgentMessages(rows: MessageRow[])
  : { role: 'user' | 'assistant'; content: string }[];
```

assistant 空 content（仅卡片）的占位文案逻辑保留。

**改动 4：handlers.ts**

handlers.ts 本身不需要改逻辑——`state.cached*` 已经把所有需要持久化的字段都缓存好了。但需要在 `route.ts` 的 finally 块里组装一个 `extractAssistantArtifacts(state)` 工具：

```ts
/**
 * 从结束态 state 提取要落库的 assistant 制品。
 * 注意：纯文本回复 finalContent 非空、TripCard 流 finalContent 在 short-circuit 时已清空。
 */
function extractAssistantArtifacts(state: ChatStreamState): {
  content: string;
  card: TripCard | null;
  itinerary: Itinerary | null;
  transport: TransportPlan | null;
  food: FoodRecommendation | null;
};
```

card 合成：当 `cachedHero && cachedWeatherWithSummary && cachedAttractionsWithDescriptions` 三者都有 → 合成完整 TripCard；否则 null。

### 5.2 app.ts 装配顺序

```ts
app.use(pinoLogger(...));
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(bodyParser());
app.keys = [env.JWT_SECRET];                 // 新增

const authRouter = new Router();             // 新增：无需 auth 的认证路由
authRouter.post('/api/auth/register', registerRoute);
authRouter.post('/api/auth/login',    loginRoute);
authRouter.post('/api/auth/logout',   logoutRoute);

const protectedRouter = new Router();        // 新增：需 auth 的路由
protectedRouter.use(authRequired);
protectedRouter.get('/api/auth/me', meRoute);
protectedRouter.get('/api/conversations',     listConversationsRoute);
protectedRouter.post('/api/conversations',    createConversationRoute);
protectedRouter.get('/api/conversations/:id', detailConversationRoute);
protectedRouter.delete('/api/conversations/:id', deleteConversationRoute);
protectedRouter.post('/api/chat', chatRoute);  // 从原 router 迁过来

app.use(authRouter.routes()).use(authRouter.allowedMethods());
app.use(protectedRouter.routes()).use(protectedRouter.allowedMethods());
```

### 5.3 env.ts 新增

```ts
DATABASE_URL: z.string().min(1).default('./data/dev.db'),
JWT_SECRET:   z.string().min(32),  // 至少 32 字符随机串
COOKIE_NAME:  z.string().min(1).default('travel_auth'),
NODE_ENV:     z.enum(['development', 'production', 'test']).default('development'),
```

### 5.4 index.ts 启动钩子

```ts
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db } from './db/client.js';

// 启动前自动跑未执行的 migration
migrate(db, { migrationsFolder: './drizzle/migrations' });

const server = app.listen(env.PORT, ...);
```

### 5.5 SSE 新事件类型

`packages/shared/src/chat.ts` 的 StreamEvent union 新增一项：

```ts
| { type: 'conversation'; conversationId: string; isNew: boolean }
```

`apps/server/src/routes/chat/route.ts` 在 `agent.streamEvents` 之前 emit 这一帧；前端拿到后把 conversationId 写进 URL 或本地状态。

---

## 6. shared 包改动

### 6.1 新增 packages/shared/src/auth.ts

```ts
/** 公开的用户信息（不含密码 hash）。 */
export interface AuthUser {
  id: string;
  email: string;
  username: string;
  createdAt: number;
}

export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: AuthUser;
}
```

### 6.2 新增 packages/shared/src/conversation.ts

```ts
import type { ChatMessage } from './chat.js';
import type { TripCard, Itinerary, TransportPlan, FoodRecommendation } from './travel.js';

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface ConversationListItem extends Conversation {
  lastMessagePreview?: string;
}

export interface ConversationListResponse {
  items: ConversationListItem[];   // 服务端固定返回最近 20 条
}

/** 从 DB 取出的消息，扩展了反序列化后的卡片字段。 */
export interface ChatMessageWithCards extends ChatMessage {
  card?: TripCard;
  itinerary?: Itinerary;
  transport?: TransportPlan;
  food?: FoodRecommendation;
}

export interface ConversationDetailResponse {
  conversation: Conversation;
  messages: ChatMessageWithCards[];
}

export interface CreateConversationRequest {
  title?: string;
}
```

### 6.3 改动 packages/shared/src/chat.ts

```ts
// ChatRequest 字段调整
export interface ChatRequest {
  message: string;
  conversationId?: string;  // 新增；history 字段移除
}

// StreamEvent union 新增一个 variant
export type StreamEvent =
  | ...existing...
  | { type: 'conversation'; conversationId: string; isNew: boolean };
```

### 6.4 改动 packages/shared/src/index.ts

```ts
export * from './chat.js';
export * from './travel.js';
export * from './sse.js';
export * from './auth.js';          // 新增
export * from './conversation.ts';  // 新增
```

---

## 7. 可复用的现有工具

实施时优先复用：

- **JWT 签发**：`jose` 已装，复用而非新装 jsonwebtoken
- **Zod 校验**：`apps/server/src/routes/chat/types.ts:7` 的 ChatRequestSchema 范式直接照搬到 auth/conversations 路由的请求校验
- **日志器**：`apps/server/src/routes/chat/logger.ts` 的 `createChatLogger()` 模式复制为 `createAuthLogger()` / `createConvLogger()`
- **SSE emit**：`apps/server/src/routes/chat/sseLifecycle.ts` 的 `createEventEmitter` 不需改造，新增 `'conversation'` 事件直接调即可
- **State 缓存**：`apps/server/src/routes/chat/types.ts:74-94` 的 `ChatStreamState.cached*` 字段已经把要落库的所有结构化卡片缓存好了，无需改 handlers.ts

---

## 8. 数据库工作流

### 8.1 npm scripts（apps/server/package.json）

```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate":  "drizzle-kit migrate",
    "db:seed":     "tsx src/db/seed.ts",
    "db:reset":    "rm -f data/dev.db && pnpm db:migrate && pnpm db:seed",
    "db:studio":   "drizzle-kit studio"
  }
}
```

### 8.2 .gitignore 新增

```
apps/server/data/*.db
apps/server/data/*.db-shm
apps/server/data/*.db-wal
```

### 8.3 drizzle.config.ts

```ts
export default {
  schema: './src/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'sqlite',
  dbCredentials: { url: env.DATABASE_URL },
} satisfies Config;
```

### 8.4 多人开发一致性

- **Schema 一致性**：migration 文件进 git，开发者拉代码后 `pnpm db:migrate`
- **数据一致性**：seed.ts 用 `onConflictDoNothing()` 保证幂等；CI 跑 `db:reset` 确定基线
- **测试隔离**：单元测试用 `:memory:` SQLite，每个测试套件独立实例

### 8.5 git pull 后自动 migrate（Husky post-merge hook）

避免「拉了代码忘了跑 migrate 导致启动报错」。新增依赖 + 钩子：

**根 package.json：**

```json
{
  "scripts": {
    "prepare": "husky"
  },
  "devDependencies": {
    "husky": "^9.1.0"
  }
}
```

首次安装：`pnpm add -Dw husky && pnpm prepare && npx husky init`，然后写入 `.husky/post-merge`：

```bash
#!/usr/bin/env sh
# 仅当本次 merge / pull 改动了 migration 目录时才跑 migrate，避免每次 pull 都启 sqlite 进程。
changed="$(git diff-tree -r --name-only --no-commit-id ORIG_HEAD HEAD 2>/dev/null || true)"
if echo "$changed" | grep -q "apps/server/drizzle/migrations/"; then
  echo "[post-merge] detected drizzle migration changes, running pnpm db:migrate..."
  pnpm -F @travel/server db:migrate
fi

# 同时检查 schema.ts 是否变更但 migration 没生成（防止队友忘了 generate）
if echo "$changed" | grep -q "apps/server/src/db/schema.ts"; then
  echo "[post-merge] schema.ts changed; if no new migration appeared above, ask the author to run db:generate."
fi
```

**注意点：**

- `git pull --rebase` 不会触发 post-merge，需另加 `post-rewrite`（可选）。本项目主流程是 merge，先只配 post-merge 即可。
- `.husky/` 目录进 git；`.husky/_/` 子目录进 .gitignore（husky 9 会自动管理）。
- README 需补一段「首次 clone 后跑 `pnpm install` 即可自动激活 hook」。

---

## 9. 验证步骤

实施完成后逐步验证：

### 9.1 离线 / 类型校验

```bash
# 在仓库根
pnpm -r typecheck                       # 全 workspace 类型检查
pnpm -F @travel/server build            # server 编译通过
pnpm -F @travel/server db:generate      # 看 drizzle 生成 migration 是否符合预期
```

### 9.2 数据库连通

```bash
pnpm -F @travel/server db:reset         # 删库重建 + seed
pnpm -F @travel/server db:studio        # 浏览三张表，确认 schema 正确
```

### 9.3 接口端到端（手动 / curl）

```bash
# 1) 注册
curl -i -X POST http://localhost:3001/api/auth/register \
  -H 'Content-Type: application/json' \
  -c cookie.txt \
  -d '{"email":"alice@test.com","username":"alice","password":"12345678"}'
# 期望: 201 + Set-Cookie: travel_auth=...

# 2) me
curl -i http://localhost:3001/api/auth/me -b cookie.txt
# 期望: 200 + user 信息

# 3) 列对话（应为空）
curl -i http://localhost:3001/api/conversations -b cookie.txt
# 期望: 200 { items: [], nextCursor: undefined }

# 4) 发起聊天（不带 conversationId → 自动建对话）
curl -i -N -X POST http://localhost:3001/api/chat \
  -H 'Content-Type: application/json' -H 'Accept: text/event-stream' \
  -b cookie.txt \
  -d '{"message":"明天去北京天气怎么样"}'
# 期望: SSE 流首帧 event: conversation 含 conversationId

# 5) 用拿到的 conversationId 取详情
curl -i http://localhost:3001/api/conversations/<id> -b cookie.txt
# 期望: 200 含 1 条 user + 1 条 assistant，assistant 的 card 字段含 TripCard JSON

# 6) 续聊（带 conversationId，验证 history 加载）
curl -i -N -X POST http://localhost:3001/api/chat \
  -H 'Content-Type: application/json' -H 'Accept: text/event-stream' \
  -b cookie.txt \
  -d '{"message":"那帮我排个 3 日行程","conversationId":"<id>"}'
# 期望: LLM 上下文记住"北京"，返回 itinerary 事件

# 7) 未登录访问受保护接口
curl -i http://localhost:3001/api/conversations
# 期望: 401

# 8) 跨用户隔离
# 用 Bob 的 cookie 访问 Alice 的对话 → 期望 404
```

### 9.4 单元测试（最小集）

新增 vitest 用例（如未配置先加 vitest）：

- `auth/jwt.test.ts`：sign + verify 往返、过期 token 拒绝
- `auth/password.test.ts`：hash + compare、错误密码拒绝
- `db/repositories/*.test.ts`：用 `:memory:` SQLite，验证 CRUD 与归属权过滤

---

## 10. 生产环境 Docker 改动

现状（已读 `Dockerfile.server` / `docker-compose.yml` / `.dockerignore`）：

- 多阶段构建 `node:24-alpine`，runner 阶段 `--prod` 安装
- `docker-compose.yml` 的 server 服务只挂载 `./secrets`，**没有任何持久化卷**
- `.env` 通过 `env_file` 注入

引入 SQLite 后需要改 5 处：

### 10.1 Dockerfile.server：补 native build 依赖

`better-sqlite3` 是 native 模块，alpine 默认没编译工具会装失败。**builder 和 runner 都需要装**——builder 装为了构建，runner 装为了 `pnpm install --prod` 时重 build native 绑定（或者不重装，把 builder 的 node_modules 拷过来）：

```dockerfile
FROM node:24-alpine AS builder
WORKDIR /app
RUN corepack enable
RUN apk add --no-cache python3 make g++   # 新增

# ... existing copy & install ...

# runner
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
RUN apk add --no-cache python3 make g++   # 新增（pnpm install --prod 阶段会触发 better-sqlite3 重编译）
```

> **更优方案**：runner 阶段不再跑 `pnpm install --prod`，而是直接从 builder 复制完整 `node_modules`（连 native 二进制一起搬过来），就不需要装 build deps。但当前 Dockerfile 已分两次 install，改造影响面大；先用「runner 也装 build deps」的最小改动方案，体积代价仅约 50MB。

### 10.2 Dockerfile.server：拷贝 migration 文件

启动时要跑 migrate，必须把 `drizzle/migrations` 带进 runner 镜像：

```dockerfile
# runner 阶段 COPY 块新增
COPY --from=builder /app/apps/server/drizzle /app/apps/server/drizzle
```

> migration SQL 不会被 tsc 编译，直接复制源文件目录即可。

### 10.3 docker-compose.yml：挂载数据卷

否则容器重启 SQLite 文件丢失。`server` 服务下加：

```yaml
services:
  server:
    # ...existing...
    volumes:
      - ./secrets:/app/secrets:ro
      - ./data:/app/apps/server/data    # 新增：SQLite db 目录
    environment:
      PORT: 3001
      CORS_ORIGIN: http://localhost:8080
      QWEATHER_PRIVATE_KEY_PATH: /app/secrets/qweather-ed25519-private.pem
      DATABASE_URL: /app/apps/server/data/prod.db   # 新增（绝对路径更稳）
      JWT_SECRET: ${JWT_SECRET}                     # 新增（从 .env 读取）
      COOKIE_NAME: travel_auth                      # 新增
      NODE_ENV: production                          # 新增
```

宿主机 `./data/` 目录需要先 `mkdir -p data && chmod 755 data`，否则容器启动写入失败。

### 10.4 .env / .env.example 新增字段

```bash
# .env.example 新增
DATABASE_URL=./data/dev.db
JWT_SECRET=please-replace-with-output-of-openssl-rand-base64-48
COOKIE_NAME=travel_auth
NODE_ENV=development
```

`docker-compose.yml` 已 `env_file: - .env`，会自动注入。生产环境的 `.env` **必须**用 `openssl rand -base64 48` 生成真随机 JWT_SECRET。

### 10.5 .dockerignore 新增

避免把开发用的 dev.db 误打进镜像：

```
**/data/*.db
**/data/*.db-shm
**/data/*.db-wal
```

### 10.6 跨域 Cookie 的边界

当前 `CORS_ORIGIN: http://localhost:8080`，server 在 `:3001`，浏览器视角是**跨端口**=跨 origin。`SameSite=Lax` + `credentials: true` 可以工作（Lax 允许同站不同端口的 navigation 与 fetch）。

但若上线时 web 与 server 部署在不同域名（例如 `travel.example.com` ↔ `api.travel.example.com`），需要：

- `sameSite: 'none'`（跨站允许）
- `secure: true`（必须 https）
- 反向代理（nginx）把两者放到同一主域下并用 path 区分（推荐，**Cookie 可保持 Lax**）

本期方案默认走「同主域反代」路线，docker-compose 不做修改；只在 README 部署章节写明此约束。

---

## 11. 风险与遗留事项

- **本地 dev 用 http**：`secure: false` 才能写 Cookie；上线前务必 `NODE_ENV=production` 并跑在 https 后面。
- **JWT_SECRET 泄漏 = 全员 token 失效**：写到 `.env.example` 时只放占位符，并在 README 提示用 `openssl rand -base64 48` 生成。
- **SSE 中途 token 过期**：当前 30 天有效期、流通常秒级完成，可忽略；如未来支持长流（>1h），需在 SSE 建立时刷新 token。
- **对话列表 20 条上限**：当前固定返回最近 20 条，不分页。重度用户超量时需要后续扩展 cursor 分页或前端加「加载更多」。
- **better-sqlite3 同步 IO**：单进程下没问题；如未来开多 worker / cluster，多进程同时写同一个 SQLite 文件会有锁竞争（WAL 模式可缓解，仍非长久之计），届时迁移 PG。
- **本方案仅含 server 改造**：前端 `useTravelAgent.ts` / `client.ts` / 新增对话列表页是后续独立任务，不在本次范围。需要时单独提 plan。
- **plans 归档**：本计划生成后需根据项目规则 cp 一份到 `plans/2026-05-06/sqlite-drizzle-server-plan.md`（实施阶段第一步执行，plan 模式不允许写仓库目录）。
