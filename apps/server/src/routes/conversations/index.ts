// 对话历史模块路由。整组都需要登录态：use(authRequired) 写在模块顶部，
// 一眼可见鉴权边界，新增路由不会漏挂中间件。
import Router from "@koa/router";
import { authRequired } from "../../auth/middleware.js";
import { createConversationRoute } from "./create.js";
import { deleteConversationRoute } from "./delete.js";
import { detailConversationRoute } from "./detail.js";
import { listConversationsRoute } from "./list.js";

/** 对话历史模块 Router。prefix=/api/conversations，所有路由路径用相对值。 */
export const conversationsRouter = new Router({ prefix: "/api/conversations" });

// 整组鉴权：本模块下所有路由都要求登录
conversationsRouter.use(authRequired);

conversationsRouter.get("/", listConversationsRoute);
conversationsRouter.post("/", createConversationRoute);
conversationsRouter.get("/:id", detailConversationRoute);
conversationsRouter.delete("/:id", deleteConversationRoute);
