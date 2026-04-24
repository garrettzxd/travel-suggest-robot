import type { ChatRequest } from '@travel/shared';

// 发起聊天请求并返回 SSE 响应体，调用方负责逐帧读取流内容。
export async function postChat(
  body: ChatRequest,
  signal?: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    throw new Error(`Chat request failed (${res.status}): ${text}`);
  }

  return res.body;
}
