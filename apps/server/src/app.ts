// Koa 应用装配：中间件 + 路由集合。
// 路由声明已下沉到 routes/<feature>/index.ts，本文件只关心装配顺序。
//
// 顺序意义：
// 1. pino 最外层，覆盖 404 / 异常路径的访问日志
// 2. CORS 在 bodyParser 前，预检 OPTIONS 不需要解析 body
// 3. bodyParser 在路由前，handler 才能拿到 ctx.request.body
// 4. applyRouters 最后挂，覆盖所有业务路由
import Koa from "koa";
import cors from "@koa/cors";
import { bodyParser } from "@koa/bodyparser";
// @ts-expect-error no types published
import pinoLogger from "koa-pino-logger";
import { env } from "./env.js";
import { applyRouters } from "./routes/index.js";
import { apiErrorMiddleware } from "./utils/apiResponse.js";

const app = new Koa();

// Koa cookies 模块要求 app.keys 才能启用签名 Cookie；JWT 我们自己签，
// 但保持 keys 设置能让 ctx.cookies.set 在需要签名 Cookie 的场景一致工作。
app.keys = [env.JWT_SECRET];

// pino 最外层：autoLogging=false 让业务路由自己决定日志粒度
app.use(
  pinoLogger({
    level: env.LOG_LEVEL,
    autoLogging: false,
  }),
);

app.use(apiErrorMiddleware);

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
