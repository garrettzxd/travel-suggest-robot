// 认证模块路由。模块自管 prefix 与鉴权边界：
// - 公开：register / login / logout
// - 受保护：me（用单条路由级 authRequired，避免污染整组）
import Router from "@koa/router";
import { authRequired } from "../../auth/middleware.js";
import { loginRoute } from "./login.js";
import { logoutRoute } from "./logout.js";
import { meRoute } from "./me.js";
import { registerRoute } from "./register.js";

/** 认证模块 Router。prefix 自动拼接到每条路由路径前。 */
export const authRouter = new Router({ prefix: "/api/auth" });

authRouter.post("/register", registerRoute);
authRouter.post("/login", loginRoute);
authRouter.post("/logout", logoutRoute);

// 单条路由级中间件链：authRequired 注入 ctx.state.userId 后才进 meRoute
authRouter.get("/me", authRequired, meRoute);
