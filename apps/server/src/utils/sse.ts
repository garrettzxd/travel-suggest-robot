// SSE 帧写入工具。分隔符常量从 @travel/shared 导出，前后端同源，避免手抖改错。
import type { Writable } from "node:stream";
import { STREAM_SEPARATOR, PART_SEPARATOR, KV_SEPARATOR } from "@travel/shared";

/**
 * 拼一个标准 SSE 帧并写入响应流。格式为：
 * `event: <event>\ndata: <json>\n\n`
 *
 * 必须走 Buffer(..., "utf8")：中文 / emoji 等多字节字符如果直接 `stream.write(string)`
 * 在 Koa 某些路径下会按 latin1 编码，导致客户端解出乱码。
 * 返回值沿用 stream.write 的 boolean：false 表示触发 backpressure，调用方可据此节流。
 */
export function writeEvent(stream: Writable, event: string, data: unknown): boolean {
  const frame =
    `event${KV_SEPARATOR} ${event}` +
    `${PART_SEPARATOR}` +
    `data${KV_SEPARATOR} ${JSON.stringify(data)}` +
    `${STREAM_SEPARATOR}`;
  return stream.write(Buffer.from(frame, "utf8"));
}
