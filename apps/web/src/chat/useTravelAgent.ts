import { useRef, useState } from 'react';
import { STREAM_SEPARATOR, PART_SEPARATOR, KV_SEPARATOR } from '@travel/shared';
import type { ChatMessage, ChatRequest, ToolName } from '@travel/shared';
import { postChat } from '../api/client';

export interface ToolTraceEntry {
  name: ToolName;
  status: 'running' | 'done' | 'error';
  args?: unknown;
  result?: unknown;
}

export interface TravelChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status?: 'local' | 'loading' | 'updating' | 'success' | 'error' | 'abort';
}

// 解析单个 SSE frame，兼容多行 data 字段并在 JSON 解析失败时保留原文。
function parseFrame(frame: string): { event: string; data: unknown } | null {
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

// 持续读取响应流，按 SSE 分隔符切分并逐个产出事件帧。
async function* readSseFrames(stream: ReadableStream<Uint8Array>) {
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
        // buffer 可能一次包含多个 SSE frame，需要循环消费到剩余不完整片段。
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

// 将 UI 消息转换为服务端需要的历史消息结构。
function toHistory(messages: TravelChatMessage[]): ChatMessage[] {
  return messages.map((message, index) => ({
    role: message.role,
    content: message.content,
    id: message.id,
    createdAt: Date.now() + index,
  }));
}

// 将最近一个同名运行中工具标记为完成，找不到时补一条完成记录。
function markToolDone(entries: ToolTraceEntry[], payload: { name: ToolName; result: unknown }) {
  const next = [...entries];
  // 从后往前匹配，避免并行工具或重复工具名时更新到更早的调用记录。
  for (let index = next.length - 1; index >= 0; index -= 1) {
    const entry = next[index];
    if (entry?.name === payload.name && entry.status === 'running') {
      next[index] = { ...entry, status: 'done', result: payload.result };
      return next;
    }
  }
  next.push({ name: payload.name, status: 'done', result: payload.result });
  return next;
}

// useTravelAgent 封装聊天请求、SSE 消费、消息状态和工具进度状态。
export function useTravelAgent() {
  const [messages, setMessages] = useState<TravelChatMessage[]>([]);
  const [toolTrace, setToolTrace] = useState<ToolTraceEntry[]>([]);
  const [isRequesting, setIsRequesting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // 发送用户输入并把服务端 SSE 事件增量合并到当前 assistant 消息。
  async function onRequest(input: string) {
    const message = input.trim();
    if (!message) return;

    // 新请求会中止上一个仍在进行的请求，避免旧流继续写入界面。
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const baseMessages = messages;
    const userMessage: TravelChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: message,
      status: 'local',
    };
    const assistantMessageId = `assistant-${Date.now()}`;

    setMessages((prev) => [
      ...prev,
      userMessage,
      { id: assistantMessageId, role: 'assistant', content: '', status: 'loading' },
    ]);
    setToolTrace([]);
    setIsRequesting(true);

    const body: ChatRequest = { message, history: toHistory(baseMessages) };
    let accumulated = '';

    try {
      const stream = await postChat(body, controller.signal);

      for await (const { event, data } of readSseFrames(stream)) {
        if (event === 'token') {
          const delta = (data as { delta?: string }).delta ?? '';
          accumulated += delta;
          setMessages((prev) =>
            prev.map((entry) =>
              entry.id === assistantMessageId
                ? { ...entry, content: accumulated, status: 'updating' }
                : entry,
            ),
          );
          continue;
        }

        if (event === 'tool_start') {
          const payload = data as { name: ToolName; args: unknown };
          setToolTrace((prev) => [
            ...prev,
            { name: payload.name, status: 'running', args: payload.args },
          ]);
          continue;
        }

        if (event === 'tool_end') {
          const payload = data as { name: ToolName; result: unknown };
          setToolTrace((prev) => markToolDone(prev, payload));
          continue;
        }

        if (event === 'final') {
          accumulated = (data as { content?: string }).content ?? accumulated;
          setMessages((prev) =>
            prev.map((entry) =>
              entry.id === assistantMessageId
                ? { ...entry, content: accumulated, status: 'success' }
                : entry,
            ),
          );
          continue;
        }

        if (event === 'error') {
          const errorMessage =
            (data as { message?: string }).message ?? '服务暂时不可用，请稍后再试。';
          setToolTrace((prev) =>
            prev.map((entry) =>
              entry.status === 'running' ? { ...entry, status: 'error' } : entry,
            ),
          );
          setMessages((prev) =>
            prev.map((entry) =>
              entry.id === assistantMessageId
                ? { ...entry, content: `请求失败：${errorMessage}`, status: 'error' }
                : entry,
            ),
          );
          return;
        }

        if (event === 'done') break;
      }
    } catch (error) {
      if ((error as { name?: string }).name !== 'AbortError') {
        const messageText = error instanceof Error ? error.message : String(error);
        setToolTrace((prev) =>
          prev.map((entry) =>
            entry.status === 'running' ? { ...entry, status: 'error' } : entry,
          ),
        );
        setMessages((prev) =>
          prev.map((entry) =>
              entry.id === assistantMessageId
                ? { ...entry, content: `请求失败：${messageText}`, status: 'error' }
                : entry,
          ),
        );
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setIsRequesting(false);
      }
    }
  }

  return { messages, onRequest, toolTrace, isRequesting };
}
