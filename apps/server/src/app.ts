// Koa 应用装配：日志 → CORS → bodyParser → 路由。中间件顺序会影响日志能否覆盖 404、
// CORS 是否作用于预检 OPTIONS，所以不要随便调整。
import Koa from "koa";
import Router from "@koa/router";
import cors from "@koa/cors";
import { bodyParser } from "@koa/bodyparser";
// @ts-expect-error no types published
import pinoLogger from "koa-pino-logger";
import { env } from "./env.js";
import { chatRoute } from "./routes/chat.js";

const app = new Koa();

// pino 作为最外层中间件：记录所有入/出请求；autoLogging=false 让业务接口自行决定日志粒度。
app.use(
  pinoLogger({
    level: env.LOG_LEVEL,
    autoLogging: false,
  }),
);

// dev 环境下 5173（Vite）与 3001（Koa）跨 Origin，需要放行并允许携带 Cookie。
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  }),
);

app.use(bodyParser());

const router = new Router();
router.post("/api/chat", chatRoute);

app.use(router.routes());
app.use(router.allowedMethods());

export { app };
