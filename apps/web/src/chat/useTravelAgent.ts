import { useRef, useState } from 'react';
import type { ChatRequest } from '@travel/shared';
import { postChat } from '../api/client';
import type { ToolTraceEntry, TravelChatMessage } from './types';
import { readSseFrames } from './sse/parser';
import { sseEventHandlers } from './sse/eventHandlers';
import { toHistory } from './message/history';
import { patchAssistantMessage } from './message/patch';
import { markRunningToolsAsError } from './tool/trace';

// 历史 import 路径仍依赖此文件导出 TravelChatMessage / ToolTraceEntry，保留 re-export 兼容。
export type { TravelChatMessage, ToolTraceEntry } from './types';

/**
 * useTravelAgent：聊天请求 + SSE 消费的编排层。
 * - 状态：messages / toolTrace / isRequesting；
 * - 编排：发请求 → 逐帧拉事件 → 委托给 sseEventHandlers 注册表更新状态；
 * - 生命周期：abortRef 管理请求取消，catch / finally 兜底异常与状态收尾。
 *
 * 业务细节（事件→状态映射、历史摘要、卡片合成）已拆到独立模块，新增卡片时主循环不动。
 * 详见 apps/web/src/chat/ARCHITECTURE.md。
 */
export function useTravelAgent() {
  const [messages, setMessages] = useState<TravelChatMessage[]>([]);
  const [toolTrace, setToolTrace] = useState<ToolTraceEntry[]>([]);
  const [isRequesting, setIsRequesting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  /**
   * 发送用户输入并把服务端 SSE 事件增量合并到当前 assistant 消息。
   * @param input 用户输入文本，trim 后为空会直接返回
   */
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

    // TODO(persistence-frontend): 后续 plan 接入 conversationId + 登录态后，
    // history 不再由前端上传；当前 baseMessages 仅本地 UI 状态使用，不再随请求发送。
    void baseMessages;
    const body: ChatRequest = { message };
    const tokenBuffer = { current: '' };
    const ctx = { assistantMessageId, tokenBuffer, setMessages, setToolTrace };

    try {
      const stream = await postChat(body, controller.signal);

      for await (const { event, data } of readSseFrames(stream)) {
        if (event === 'done') break;
        const handler = sseEventHandlers[event];
        if (!handler) continue; // 未注册事件静默忽略，保持向后兼容。
        const result = handler(data, ctx);
        if (result === 'stop') return;
      }
    } catch (error) {
      if ((error as { name?: string }).name !== 'AbortError') {
        const messageText = error instanceof Error ? error.message : String(error);
        setToolTrace((prev) => markRunningToolsAsError(prev));
        setMessages((prev) =>
          patchAssistantMessage(prev, assistantMessageId, {
            content: `请求失败：${messageText}`,
            status: 'error',
          }),
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
