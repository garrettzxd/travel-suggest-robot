import { useEffect, useState } from 'react';
import { Bubble, Sender, ThoughtChain } from '@ant-design/x';
import type { BubbleProps, ThoughtChainItemType } from '@ant-design/x';
import XMarkdown from '@ant-design/x-markdown';
import { Typography } from 'antd';
import { useTravelAgent, type ToolTraceEntry } from './useTravelAgent';

const TYPING_STEP = 2;
const TYPING_INTERVAL = 30;

// MarkdownTyping 负责把 assistant 的 Markdown 内容按字符逐步展示。
function MarkdownTyping({ content }: { content: string }) {
  const [visible, setVisible] = useState(0);

  useEffect(() => {
    if (visible >= content.length) return;
    // 用定时器模拟打字效果，避免一次性渲染大段回复。
    const timer = setTimeout(() => {
      setVisible((v) => Math.min(content.length, v + TYPING_STEP));
    }, TYPING_INTERVAL);
    return () => clearTimeout(timer);
  }, [visible, content.length]);

  const shown = content.slice(0, Math.min(visible, content.length));
  return (
    <Typography>
      <XMarkdown content={shown} />
    </Typography>
  );
}

// Bubble 的 contentRender 入口，把原始文本交给 Markdown 打字组件处理。
const renderMarkdown: BubbleProps['contentRender'] = (content) => (
  <MarkdownTyping content={typeof content === 'string' ? content : String(content ?? '')} />
);

const roles = {
  user: {
    placement: 'end' as const,
    variant: 'filled' as const,
  },
  assistant: {
    placement: 'start' as const,
    variant: 'outlined' as const,
    contentRender: renderMarkdown,
  },
};

const toolLabels: Record<string, string> = {
  getWeather: '查询天气中',
  getAttractions: '搜索景点中',
};

// 将工具调用轨迹转换为 ThoughtChain 可以识别的节点状态。
function traceToThoughtItems(trace: ToolTraceEntry[]): ThoughtChainItemType[] {
  return trace.map((entry, idx) => ({
    key: `${entry.name}-${idx}`,
    title: toolLabels[entry.name] ?? entry.name,
    status:
      entry.status === 'running' ? 'loading' : entry.status === 'done' ? 'success' : 'error',
  }));
}

// ChatPage 负责聊天消息布局、输入框状态和工具调用进度展示。
export default function ChatPage() {
  const { messages, onRequest, toolTrace, isRequesting } = useTravelAgent();
  const [inputValue, setInputValue] = useState('');
  const pendingAssistantId = messages.findLast(
    (message) => message.role === 'assistant' && message.status !== 'success',
  )?.id;

  const items = messages.map(({ id, role, content, status }) => ({
    key: id,
    role,
    content: content || (status === 'loading' ? '正在思考中...' : ''),
    loading: status === 'loading',
    status,
    streaming: id === pendingAssistantId && status === 'updating',
  }));

  const thoughtItems = traceToThoughtItems(toolTrace);

  // 提交后立刻清空输入框，请求生命周期交给 useTravelAgent 管理。
  const handleSubmit = (value: string) => {
    const message = value.trim();
    if (!message) return;
    setInputValue('');
    onRequest(message);
  };

  return (
    <div
      style={{
        height: '100vh',
        width: '100vw',
        display: 'flex',
        flexDirection: 'column',
        padding: 16,
        gap: 12,
        maxWidth: 960,
        margin: '0 auto',
      }}
    >
      <Typography.Title level={3} style={{ margin: 0 }}>
        旅行建议机器人
      </Typography.Title>

      <div style={{ flex: 1, overflow: 'auto', paddingRight: 4 }}>
        <Bubble.List role={roles} items={items} />
        {isRequesting && thoughtItems.length > 0 && (
          <div style={{ marginTop: 12, paddingLeft: 48 }}>
            <ThoughtChain items={thoughtItems} />
          </div>
        )}
      </div>

      <Sender
        value={inputValue}
        onChange={setInputValue}
        onSubmit={handleSubmit}
        loading={isRequesting}
        placeholder="输入目的地，例如：我想去成都"
      />
    </div>
  );
}
