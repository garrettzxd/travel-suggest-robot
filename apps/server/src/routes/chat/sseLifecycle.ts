// SSE 响应生命周期：响应头 / Nagle 关闭 / 客户端断连监听，以及向前端推帧的 emitter 工厂。
// 拆分自原 chat.ts 中 ctx.respond / setHeader / setNoDelay / req.close & res.close 一段，
// 让主路由 route.ts 不再被这些低层细节遮蔽。
import type { Context } from "koa";
import { writeEvent } from "../../utils/sse.js";
import type { ChatRouteLogger } from "./logger.js";
import { previewJson } from "./logger.js";
import type { EventWriter } from "./types.js";

/**
 * 初始化 SSE 响应：
 * 1) 绕过 Koa 的 body 管线（ctx.respond=false），自己接管 ctx.res；
 * 2) 写入 SSE 必备响应头并 flushHeaders；
 * 3) 关闭响应 socket 上的 Nagle，确保每帧立即下发；
 * 4) 绑定 req/res close 监听，监听到响应未结束就断开时 abort LangGraph。
 *
 * 返回 dispose 用于在 finally 中解绑监听，避免 listener 泄漏。
 */
export function initSseResponse(
  ctx: Context,
  abortController: AbortController,
  log: ChatRouteLogger,
): { dispose: () => void } {
  // SSE 响应必须绕过 Koa 的 body 管线（不再走 PassThrough → ctx.body 那条路径）：
  // 1) 多一层 PassThrough → pipe(ctx.res) 会把每帧塞进流的内部 buffer，时机不可控；
  // 2) Koa 默认 ctx.respond=true 时会等到处理结束才正确收尾，对长流不友好。
  // 因此这里 ctx.respond=false 自己接管 ctx.res，每帧 emit 后直接走 res.write。
  ctx.respond = false;
  ctx.res.statusCode = 200;
  ctx.res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  ctx.res.setHeader("Cache-Control", "no-cache");
  ctx.res.setHeader("Connection", "keep-alive");
  // Nginx 之类的反向代理会按 X-Accel-Buffering: no 关掉缓冲；不影响本机 dev。
  ctx.res.setHeader("X-Accel-Buffering", "no");
  ctx.res.flushHeaders();
  // 关键修复：关闭响应 socket 上的 Nagle 算法。
  // Node TCP 默认 Nagle 开启（TCP_NODELAY=false），会把多次小写攒成 ~200ms 一个包再下发；
  // 对 SSE 这种"一帧一帧逐次推送"的场景就是灾难——所有事件会被打包到同一个 TCP 包里，
  // 浏览器 DevTools EventStream 看到的就是所有事件时间戳完全相同（ALL 同一毫秒）。
  // setNoDelay(true) 让每个 res.write 立即下发到 socket，事件之间的真实时间差才能体现。
  ctx.res.socket?.setNoDelay(true);

  // POST 请求体读完也会触发 req.close，不能把它当作浏览器断开连接。
  const onRequestClose = () => {
    log.debug("请求流已关闭", {
      requestComplete: ctx.req.complete,
      responseWritableEnded: ctx.res.writableEnded,
    });
  };

  // SSE 的真实断连应以响应流为准：响应未正常结束却 close，才中止 LangGraph。
  const onResponseClose = () => {
    if (ctx.res.writableEnded) {
      log.debug("响应流正常关闭");
      return;
    }

    log.warn("客户端连接已断开，停止大模型请求", {
      responseDestroyed: ctx.res.destroyed,
      aborted: abortController.signal.aborted,
    });
    abortController.abort();
    if (!ctx.res.writableEnded) {
      ctx.res.end();
    }
  };

  ctx.req.on("close", onRequestClose);
  ctx.res.on("close", onResponseClose);

  return {
    dispose: () => {
      ctx.req.off("close", onRequestClose);
      ctx.res.off("close", onResponseClose);
    },
  };
}

/**
 * 工厂方法：返回一个绑定到当前响应的 EventWriter。
 * 内部维护已写入帧数，遇到响应已关闭时打 warn 并跳过；其余情况 trace 一行写入日志，
 * 含 dataPreview（用 previewJson 截断到 200 字符，避免 card / itinerary 这类大对象刷屏）。
 */
export function createEventEmitter(ctx: Context, log: ChatRouteLogger): EventWriter {
  let sseEventCount = 0;

  return (event, data) => {
    if (ctx.res.writableEnded || ctx.res.destroyed) {
      log.warn("SSE 流已关闭，跳过事件推送", {
        event,
        responseDestroyed: ctx.res.destroyed,
        responseWritableEnded: ctx.res.writableEnded,
      });
      return;
    }

    sseEventCount += 1;
    const writable = writeEvent(ctx.res, event, data);
    log.trace("SSE 事件已写入", {
      event,
      writable,
      sseEventCount,
      dataPreview: previewJson(data, 200),
    });
  };
}
