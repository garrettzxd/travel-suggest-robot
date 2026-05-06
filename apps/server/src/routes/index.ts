// 所有 feature router 的统一注册入口。
// 加新模块只需要：在此文件 import + 数组追加一行。app.ts 永远不动。
import type Koa from "koa";
import type Router from "@koa/router";
import { authRouter } from "./auth/index.js";
import { chatRouter } from "./chat/index.js";
import { conversationsRouter } from "./conversations/index.js";

/**
 * 注册顺序 = 匹配优先级。当前各模块路径不冲突，按字母序即可。
 * 未来若新增同前缀路由（如 /api/admin/* 想覆盖 /api/* 的某条），
 * 需要把更具体的 router 排在更通用的前面。
 */
const routers: Router[] = [authRouter, conversationsRouter, chatRouter];

/**
 * 把所有 feature router 一次性挂到 Koa 应用。
 * routes() 装路径分发，allowedMethods() 装 405 / OPTIONS 兜底。
 */
export function applyRouters(app: Koa): void {
  for (const r of routers) {
    app.use(r.routes()).use(r.allowedMethods());
  }
}
