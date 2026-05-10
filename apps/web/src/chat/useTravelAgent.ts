import { useCallback, useRef, useState } from 'react';
import type { ChatMessageWithCards, ChatRequest } from '@travel/shared';
import { postChat } from '../api/client';
import type { ToolTraceEntry, TravelChatMessage } from './types';
import { readSseFrames } from './sse/parser';
import { sseEventHandlers } from './sse/eventHandlers';
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
export interface ConversationSsePayload {
  conversationId: string;
  isNew: boolean;
}

export interface UseTravelAgentOptions {
  onConversationResolved?: (payload: ConversationSsePayload) => void;
  onRequestSettled?: (conversationId: string | null) => void;
}

function toTravelMessage(message: ChatMessageWithCards): TravelChatMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
    status: message.role === 'user' ? 'local' : 'success',
    ...(message.card ? { card: message.card } : {}),
    ...(message.itinerary ? { itinerary: message.itinerary } : {}),
    ...(message.transport ? { transport: message.transport } : {}),
    ...(message.food ? { food: message.food } : {}),
  };
}

export function useTravelAgent(options: UseTravelAgentOptions = {}) {
  const [messages, setMessages] = useState<TravelChatMessage[]>([]);
  const [toolTrace, setToolTrace] = useState<ToolTraceEntry[]>([]);
  const [isRequesting, setIsRequesting] = useState(false);
  const [conversationId, setConversationIdState] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const setConversationId = useCallback((next: string | null) => {
    conversationIdRef.current = next;
    setConversationIdState(next);
  }, []);

  const resetConversation = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setConversationId(null);
    setMessages([]);
    setToolTrace([]);
    setIsRequesting(false);
  }, [setConversationId]);

  const loadConversation = useCallback(
    (id: string, historyMessages: ChatMessageWithCards[]) => {
      abortRef.current?.abort();
      abortRef.current = null;
      setConversationId(id);
      setMessages(historyMessages.map(toTravelMessage));
      setToolTrace([]);
      setIsRequesting(false);
    },
    [setConversationId],
  );

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
      createdAt: Date.now(),
      status: 'local',
    };
    const assistantMessageId = `assistant-${Date.now()}`;
    const assistantCreatedAt = Date.now();

    setMessages((prev) => [
      ...prev,
      userMessage,
      {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        createdAt: assistantCreatedAt,
        status: 'loading',
      },
    ]);
    setToolTrace([]);
    setIsRequesting(true);

    // 当前历史由服务端按 conversationId 从 DB 加载；baseMessages 仅保留给本地乐观 UI。
    void baseMessages;
    const activeConversationId = conversationIdRef.current;
    const body: ChatRequest = {
      message,
      ...(activeConversationId ? { conversationId: activeConversationId } : {}),
    };
    const tokenBuffer = { current: '' };
    const ctx = { assistantMessageId, tokenBuffer, setMessages, setToolTrace };
    let resolvedConversationId = activeConversationId;

    try {
      const stream = await postChat(body, controller.signal);

      for await (const { event, data } of readSseFrames(stream)) {
        if (event === 'done') break;
        if (event === 'conversation') {
          const payload = data as Partial<ConversationSsePayload>;
          if (payload.conversationId) {
            resolvedConversationId = payload.conversationId;
            setConversationId(payload.conversationId);
            optionsRef.current.onConversationResolved?.({
              conversationId: payload.conversationId,
              isNew: !!payload.isNew,
            });
          }
          continue;
        }
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
      optionsRef.current.onRequestSettled?.(resolvedConversationId);
    }
  }

  return {
    messages,
    onRequest,
    toolTrace,
    isRequesting,
    conversationId,
    loadConversation,
    resetConversation,
  };
}
