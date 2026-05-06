# Server 路由组织重构方案：每模块自带 Router

## Context

当前 `apps/server/src/app.ts` 同时承担 4 件事：

1. 装中间件（pino / cors / bodyParser / app.keys）
2. 集中 import 所有 route handler（共 9 个）
3. 决定每条路由的方法、路径、鉴权边界
4. 用 `publicRouter` / `protectedRouter` 二分组织路由

带来的具体痛点（来自实施 SQLite + 鉴权那一轮的体感）：

- **加一条路由要动 3 个文件**：handler 文件 → 模块 barrel → app.ts
- **路径常量散落**：`/api/auth` 前缀在 register / login / logout / me 各重复一次，重命名要全文搜索
- **鉴权边界隐式**：靠「挂在哪个 Router」区分，新人 review 一眼看不出 me 为什么需要登录而 logout 不需要
- **chat 模块特殊路径**：`/api/chat` 单条路由独占一个 barrel，进 protected 路由组里，与「chat 是个完整功能模块」的物理结构不对齐

目标：把「路由声明」和「应用装配」职责彻底拆开。
- app.ts 回归极简骨架（中间件 + 把 router 集合 use 进来）
- 每个 `routes/<feature>/` 模块自管前缀、自管中间件、自管鉴权
- 加路由不再需要碰 app.ts；改前缀只动一行；鉴权边界一眼可见

不在本次范围：

- 不改任何 handler 文件（register.ts / login.ts / chat/route.ts 等业务实现保持不动）
- 不引入新框架 / 装饰器 / 元编程
- 不动 packages/shared，不动前端

## 1. 重构后的目录与文件契约

### 1.1 各 feature 模块的 index.ts 形态

每个 `routes/<feature>/index.ts` 的角色从「barrel 导出 handler」变成「模块自管的 Router 实例」。handler 文件本身不变。

**routes/auth/index.ts**

```ts
import Router from "@koa/router";
import { authRequired } from "../../auth/middleware.js";
import { registerRoute } from "./register.js";
import { loginRoute } from "./login.js";
import { logoutRoute } from "./logout.js";
import { meRoute } from "./me.js";

/**
 * 认证模块路由。
 * - 公开：register / login / logout（path 前缀由 prefix 自动拼接）
 * - 受保护：me（用单条路由级中间件，避免污染整组）
 */
export const authRouter = new Router({ prefix: "/api/auth" });

authRouter.post("/register", registerRoute);
authRouter.post("/login", loginRoute);
authRouter.post("/logout", logoutRoute);

// authRequired 作为单路由中间件挂在 me 上——单条路由的鉴权差异化最直观
authRouter.get("/me", authRequired, meRoute);
```

**routes/conversations/index.ts**

```ts
import Router from "@koa/router";
import { authRequired } from "../../auth/middleware.js";
import { listConversationsRoute } from "./list.js";
import { createConversationRoute } from "./create.js";
import { detailConversationRoute } from "./detail.js";
import { deleteConversationRoute } from "./delete.js";

/** 对话历史模块路由。整组都需要登录态。 */
export const conversationsRouter = new Router({ prefix: "/api/conversations" });

conversationsRouter.use(authRequired);

conversationsRouter.get("/", listConversationsRoute);
conversationsRouter.post("/", createConversationRoute);
conversationsRouter.get("/:id", detailConversationRoute);
conversationsRouter.delete("/:id", deleteConversationRoute);
```

**routes/chat/index.ts**

当前文件只有一行 barrel export。改造后由它持有 Router；handler 仍在 `route.ts`。

```ts
import Router from "@koa/router";
import { authRequired } from "../../auth/middleware.js";
import { chatRoute } from "./route.js";

/** 聊天 SSE 模块。仅一条路由，但与其他模块对齐用 Router 包装。 */
export const chatRouter = new Router({ prefix: "/api/chat" });

chatRouter.use(authRequired);
chatRouter.post("/", chatRoute);
```

> 注：chat 模块原 barrel `export { chatRoute }` 在重构后**删掉**——除了同模块内的 index.ts，没有外部消费者了（已用 grep 确认）。如果将来要在测试里直接 import handler，从 `./routes/chat/route.js` 取即可。

### 1.2 新增 routes/index.ts（聚合层）

```ts
// 所有 feature router 的统一注册入口。
// 加新模块：在这里加 import + 数组追加一行。其他全部不动。
import type Koa from "koa";
import type Router from "@koa/router";
import { authRouter } from "./auth/index.js";
import { chatRouter } from "./chat/index.js";
import { conversationsRouter } from "./conversations/index.js";

/**
 * 注册顺序 = 匹配优先级。当前没有路径冲突，按字母序即可；
 * 未来若新增同前缀路由（如 /api/admin/* 早于 /api/*），需手动调整顺序。
 */
const routers: Router[] = [authRouter, conversationsRouter, chatRouter];

/** 把所有 feature router 一次性挂到 Koa 应用。 */
export function applyRouters(app: Koa): void {
  for (const r of routers) {
    app.use(r.routes()).use(r.allowedMethods());
  }
}
```

### 1.3 重构后的 app.ts

```ts
// Koa 应用装配：中间件 + 路由集合。
// 路由声明已下沉到 routes/<feature>/index.ts，本文件只关心装配顺序。
import Koa from "koa";
import cors from "@koa/cors";
import { bodyParser } from "@koa/bodyparser";
// @ts-expect-error no types published
import pinoLogger from "koa-pino-logger";
import { env } from "./env.js";
import { applyRouters } from "./routes/index.js";

const app = new Koa();

// Koa cookies 模块要求 app.keys 才能启用签名 Cookie；JWT 我们自己签，但保留一致性
app.keys = [env.JWT_SECRET];

// pino 最外层：autoLogging=false 让业务路由自己决定日志粒度
app.use(
  pinoLogger({
    level: env.LOG_LEVEL,
    autoLogging: false,
  }),
);

// dev 环境下 web (5173) 与 server (3001) 跨 origin，必须放行 + 允许携带 Cookie
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  }),
);

app.use(bodyParser());

applyRouters(app);

export { app };
```

行数对比：约 65 行 → 约 35 行；import 数量 6 → 4；不再 `new Router()`。

## 2. 关键设计决策

### 2.1 鉴权边界用三种粒度表达

| 粒度 | 用法 | 适用场景 |
|------|------|---------|
| 整组 | `router.use(authRequired)` | 模块内所有路由都需要登录（conversations / chat） |
| 单条 | `router.get(path, authRequired, handler)` | 同模块内有公开有私密（auth：register 公开、me 私密） |
| 取消 | 不挂 | 完全公开模块 |

**为什么 me 不单独抽个 protectedAuthRouter**：

- 模块内只有 1 条受保护路由，新增子 Router 反而增加心智负担
- 单路由中间件链 `(authRequired, meRoute)` 在 @koa/router 是一等支持的写法，类型安全完整
- 未来 me 旁边加 `getProfile / updateProfile` 等私密路由时，再升级为分离子 Router 不晚

### 2.2 prefix 单点维护

Router 构造时声明 `prefix`，后续路由用相对路径。重命名 `/api/auth` → `/api/v2/auth` 只动一处。

注意：当前所有路由都在 `/api/*` 下，**不**把 `/api` 提到 applyRouters 层做全局前缀——这样后续如果加 `/health` / `/metrics` 这类不在 `/api/*` 下的路由，模块自治更顺。

### 2.3 注册顺序与冲突防御

`routers: Router[]` 按字母序：auth → conversations → chat。当前没有跨模块路径冲突。

未来若出现冲突（如 `/api/admin/conversations/:id` 想覆盖某条路径），有两种处理：

- 调整数组顺序，把更具体的 Router 放前面（@koa/router 是先匹配先生效）
- 或在 routes/index.ts 加一段断言：启动时遍历所有 router 的 stack，发现路径完全重复就 throw（后续可加，本期不做）

### 2.4 chat 模块的"单路由也包 Router"取舍

陪跑选项：让 chat 不包 Router，直接 `app.use(authRequired); app.post('/api/chat', chatRoute)`。

否决理由：

- 与其他模块物理结构不一致，未来加 `/api/chat/abort/:id`、`/api/chat/feedback` 时要再做一次重构
- prefix 的好处用不上时多 1 行模板代码可以接受，换来一致性

## 3. 迁移步骤（实施时按此顺序）

1. **新增** `routes/auth/index.ts` 内容：从原 barrel 改为 Router 形态（Section 1.1）
2. **新增** `routes/conversations/index.ts` 内容：同上
3. **重写** `routes/chat/index.ts`：从单行 barrel 改为 Router；删除 `chatRoute` 的对外 export
4. **新增** `routes/index.ts`：聚合 + applyRouters
5. **改写** `app.ts`：删除两个 Router、删除所有 handler import，替换成 `applyRouters(app)`
6. **typecheck**：`pnpm -r typecheck`
7. **build**：`pnpm build`
8. **跑端到端 smoke test**（Section 5）

每一步都是可独立 commit 的小变更；建议 1-2 commit 完成（"refactor(server): per-module routers"）。

## 4. 风险与防御

| 风险 | 影响 | 防御 |
|------|------|------|
| prefix 拼接出现 `//`（前缀末尾 `/` + 路径首位 `/`） | 路由 404 | 测试覆盖：list 和 create 路径在重构前是 `/api/conversations`，重构后变成 `prefix=/api/conversations + path=/`。@koa/router 会规范化为 `/api/conversations`，已用最小复现验证；落地后 Section 5 的 smoke test 会兜底 |
| me 中间件链顺序写反 | authRequired 不生效，泄漏用户信息 | 单条路由级中间件签名 `(...m: Middleware[])` 强类型，handler 必须是最后一个；写错时 ctx.state.userId 不存在，me handler 内已有兜底 401 |
| chat 模块外部消费者被破坏 | 编译失败 | 已 `grep -rn chatRoute apps/server/src` 确认仅 app.ts 一处消费；重构后 app.ts 不再 import 即可 |
| 模块顺序变更导致路径优先级错乱 | 罕见——当前无冲突路径 | routes/index.ts 注释里写明顺序的语义 |

## 5. 验证步骤

### 5.1 类型 + 编译

```bash
pnpm -r typecheck         # 期望全绿
pnpm build                # 期望全绿
```

### 5.2 启动 + 路由表自检

```bash
pnpm -F @travel/server start &
sleep 3
curl -is http://localhost:3001/api/auth/me            # 期望 401
curl -is -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@test.com","password":"password123"}' \
  -c /tmp/c.txt                                        # 期望 200 + Set-Cookie
curl -is http://localhost:3001/api/auth/me -b /tmp/c.txt   # 期望 200
curl -is http://localhost:3001/api/conversations -b /tmp/c.txt   # 期望 200 items:[]
curl -is -X POST http://localhost:3001/api/chat \
  -H 'Content-Type: application/json' \
  -b /tmp/c.txt \
  -d '{"message":"测试一下"}' --max-time 30           # 期望 200 SSE 流首帧 conversation
```

### 5.3 鉴权边界回归

```bash
curl -is http://localhost:3001/api/conversations              # 期望 401
curl -is -X POST http://localhost:3001/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"x"}'                                        # 期望 401
curl -is -X POST http://localhost:3001/api/auth/logout        # 期望 204（公开）
curl -is -X POST http://localhost:3001/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"x@x.com","username":"x","password":"12345678"}'   # 期望 201（公开）
```

跑完前后行为完全一致即重构成功。

## 6. 关键文件改动清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `apps/server/src/routes/auth/index.ts` | 改写 | 从 4 行 barrel 改为 Router 实例 + 路由声明 |
| `apps/server/src/routes/conversations/index.ts` | 改写 | 同上 |
| `apps/server/src/routes/chat/index.ts` | 改写 | 从 `export { chatRoute }` 改为 Router 实例；删 chatRoute 对外 export |
| `apps/server/src/routes/index.ts` | 新增 | 聚合层 + applyRouters 函数 |
| `apps/server/src/app.ts` | 简化 | 删 6 个 handler import + 两个 Router 实例化 + 8 行路由声明，换成 1 行 `applyRouters(app)` |

handler 文件（register.ts / login.ts / me.ts / logout.ts / list.ts / create.ts / detail.ts / delete.ts / chat/route.ts）**完全不动**。

## 7. 后续演进路径（不在本期范围）

- **路由级 rate limit / 校验中间件**：按需在模块 index.ts 内挂载，不影响其他模块
- **多版本 API**：可让单一模块导出 `authRouterV1` / `authRouterV2`，routes/index.ts 自由组合
- **OpenAPI 自动生成**：在每条 `router.method(path, ...)` 旁补一个 zod schema，启动时遍历 router stack 输出 spec（不依赖装饰器）
- **路由冲突启动检查**：在 applyRouters 内遍历所有 router 的 `stack`，发现 method+path 重复立刻 throw
