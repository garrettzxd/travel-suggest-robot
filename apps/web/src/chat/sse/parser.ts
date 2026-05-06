import { STREAM_SEPARATOR, PART_SEPARATOR, KV_SEPARATOR } from '@travel/shared';

/**
 * 解析单个 SSE frame，兼容多行 data 字段并在 JSON 解析失败时保留原文。
 * @param frame 完整的一段 SSE 帧文本（不含分隔符）
 * @returns 解析后的 { event, data } 元组；event 缺失则返回 null
 */
export function parseFrame(frame: string): { event: string; data: unknown } | null {
  let event: string | undefined;
  let rawData = '';
  for (const line of frame.split(PART_SEPARATOR)) {
    const sepIdx = line.indexOf(KV_SEPARATOR);
    if (sepIdx === -1) continue;
    const field = line.slice(0, sepIdx).trim();
    const value = line.slice(sepIdx + 1).replace(/^ /, '');
    if (field === 'event') event = value;
    else if (field === 'data') rawData = rawData ? `${rawData}\n${value}` : value;
  }
  if (!event) return null;
  try {
    return { event, data: rawData ? JSON.parse(rawData) : {} };
  } catch {
    return { event, data: rawData };
  }
}

/**
 * 持续读取响应流，按 SSE 分隔符切分并逐个产出事件帧。
 * 一次 read 可能返回多个完整帧，循环消费到剩余不完整片段为止。
 * @param stream fetch 响应体的 ReadableStream
 */
export async function* readSseFrames(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        if (buffer.trim()) {
          const parsed = parseFrame(buffer);
          if (parsed) yield parsed;
        }
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      let idx = buffer.indexOf(STREAM_SEPARATOR);
      while (idx !== -1) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + STREAM_SEPARATOR.length);
        const parsed = parseFrame(frame);
        if (parsed) yield parsed;
        idx = buffer.indexOf(STREAM_SEPARATOR);
      }
    }
  } finally {
    reader.releaseLock();
  }
}
