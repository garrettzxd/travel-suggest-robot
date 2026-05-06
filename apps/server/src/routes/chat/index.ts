// 聊天 SSE 模块路由。仅一条路由，但与其他模块对齐用 Router 包装：
// - 未来加 /api/chat/abort/:id、/api/chat/feedback 时无需重构
// - prefix 单点维护，重命名只动一处
import Router from "@koa/router";
import { authRequired } from "../../auth/middleware.js";
import { chatRoute } from "./route.js";

/** chat 模块 Router。整组鉴权（POST /api/chat 必须登录）。 */
export const chatRouter = new Router({ prefix: "/api/chat" });

chatRouter.use(authRequired);
chatRouter.post("/", chatRoute);
