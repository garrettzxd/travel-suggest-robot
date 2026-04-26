import { useEffect, useMemo, useRef, useState } from 'react';
import { Bubble } from '@ant-design/x';
import type { BubbleProps } from '@ant-design/x';
import XMarkdown from '@ant-design/x-markdown';
import { Typography } from 'antd';
import { TopBar } from './TopBar';
import { InputBar } from './InputBar';
import { WelcomeCard } from './cards/WelcomeCard';
import { TripCardView } from './cards/TripCardView';
import { ItineraryCard } from './cards/ItineraryCard';
import { useTravelAgent, type TravelChatMessage } from './useTravelAgent';
import { colors, layout, radius, spacing } from '../theme/tokens';

const TYPING_STEP = 2;
const TYPING_INTERVAL = 30;

/** MarkdownTyping：作为"无结构化数据"场景的兜底，按字符逐步展示。 */
function MarkdownTyping({ content }: { content: string }) {
  const [visible, setVisible] = useState(0);

  useEffect(() => {
    if (visible >= content.length) return;
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

/** Bubble 通用渲染，传给 fallback markdown 气泡 / 错误气泡使用。 */
const renderMarkdown: BubbleProps['contentRender'] = (content) => (
  <MarkdownTyping content={typeof content === 'string' ? content : String(content ?? '')} />
);

/**
 * 用户气泡：深墨色底 + 白字，右对齐。直接输出原始文本，不做 Markdown 解析。
 * 这里手写一个简化版，避免 Bubble 默认样式带来的灰色边和气泡尾巴。
 */
function UserBubble({ content }: { content: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <div
        style={{
          background: colors.userBubble,
          color: colors.surface,
          padding: '10px 14px',
          borderRadius: 14,
          maxWidth: '70%',
          fontSize: 14,
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {content}
      </div>
    </div>
  );
}

/** assistant 顶部信息行：圆形头像 + "漫游助手" 名 + 创建时间。 */
function AssistantHeader({ time }: { time: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs }}>
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: colors.ink,
          color: colors.surface,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 14,
          fontWeight: 700,
        }}
      >
        漫
      </div>
      <span style={{ fontSize: 13, fontWeight: 600, color: colors.ink }}>漫游助手</span>
      <span style={{ fontSize: 12, color: colors.inkMuted }}>{time}</span>
    </div>
  );
}

/** 把消息 id 中的时间戳还原为 Date，用作 assistant header 的小时分钟显示。 */
function deriveMessageTime(id: string): string {
  const ts = Number(id.split('-')[1]);
  const date = Number.isFinite(ts) ? new Date(ts) : new Date();
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** 取首条 user 消息前 16 字 + 后缀，作为 TopBar 标题；空会话则给默认值。 */
function deriveTitle(messages: TravelChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser || !firstUser.content) return '漫游 · 旅行建议';
  const head = firstUser.content.slice(0, 16);
  return head.length < firstUser.content.length ? `${head}…` : head;
}

/**
 * ChatPage 路由层：根据 assistant 消息上是否带结构化卡片数据决定渲染
 * TripCardView / ItineraryCard 还是 MarkdownTyping。空会话顶部展示 WelcomeCard。
 */
export default function ChatPage() {
  const { messages, onRequest, isRequesting } = useTravelAgent();
  const [inputValue, setInputValue] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // 新消息进来时自动滚到底部，避免用户错过流式更新。
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  const lastUpdatedAt = useMemo(() => {
    const last = messages[messages.length - 1];
    if (!last) return new Date();
    const ts = Number(last.id.split('-')[1]);
    return Number.isFinite(ts) ? new Date(ts) : new Date();
  }, [messages]);

  /** 提交后立刻清空输入框，请求生命周期交给 useTravelAgent 管理。 */
  const handleSubmit = (value: string) => {
    const text = value.trim();
    if (!text) return;
    setInputValue('');
    onRequest(text);
  };

  return (
    <div
      style={{
        height: '100vh',
        width: '100vw',
        display: 'flex',
        flexDirection: 'column',
        background: colors.bg,
      }}
    >
      <TopBar
        title={deriveTitle(messages)}
        messageCount={messages.length}
        updatedAt={lastUpdatedAt}
        online
      />

      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          paddingBottom: layout.inputBarPadBottom,
        }}
      >
        <div
          style={{
            maxWidth: layout.contentMaxWidth,
            margin: '0 auto',
            padding: `${spacing.lg}px ${spacing.md}px 0`,
            display: 'flex',
            flexDirection: 'column',
            gap: spacing.lg,
          }}
        >
          {messages.length === 0 ? (
            <WelcomeCard onSuggestionClick={onRequest} />
          ) : (
            messages.map((message) => (
              <MessageRow
                key={message.id}
                message={message}
                onChipClick={onRequest}
              />
            ))
          )}
        </div>
      </div>

      <InputBar
        value={inputValue}
        onChange={setInputValue}
        onSubmit={handleSubmit}
        loading={isRequesting}
      />
    </div>
  );
}

/**
 * 单条消息分发：user → UserBubble；assistant 视数据可用性走结构化卡片或 markdown 兜底。
 * 切换条件遵循 PRD §7.5：
 *   - loading 且未收到任何 tool_start → "正在思考中..."
 *   - 已收到 tool_start，或已有任何结构化数据 → TripCardView（按可用字段升级）
 *   - 走完未拿到任何结构化数据 → MarkdownTyping fallback
 *   - error → 错误气泡
 */
function MessageRow({
  message,
  onChipClick,
}: {
  message: TravelChatMessage;
  onChipClick: (text: string) => void;
}) {
  if (message.role === 'user') {
    return <UserBubble content={message.content} />;
  }

  const time = deriveMessageTime(message.id);
  const hasTripCardData = !!(message.weather || message.attractions || message.card);
  const hasStructured = !!(hasTripCardData || message.itinerary);

  // error：使用红色 Bubble 单独展示。
  if (message.status === 'error') {
    return (
      <div>
        <AssistantHeader time={time} />
        <Bubble
          placement="start"
          variant="outlined"
          content={message.content || '请求失败'}
          contentRender={renderMarkdown}
          styles={{
            content: {
              background: colors.avoidSoft,
              color: colors.avoid,
              borderRadius: radius.card,
            },
          }}
        />
      </div>
    );
  }

  // loading：无任何工具触发，显示纯文本提示（首次 token / final 到达后会切换形态）。
  if (message.status === 'loading' && !hasStructured && !message.hasToolStart) {
    return (
      <div>
        <AssistantHeader time={time} />
        <Bubble
          placement="start"
          variant="outlined"
          loading
          content=""
        />
      </div>
    );
  }

  // 完整行程规划卡：recommendItinerary 是内部工具，没有 tool_start，收到 itinerary 后直接渲染。
  if (message.itinerary && !message.card) {
    return (
      <div>
        <AssistantHeader time={time} />
        <ItineraryCard {...message.itinerary} />
      </div>
    );
  }

  // 进入 TripCard 流：要么已经收到 tool_start，要么已经有 TripCard 相关结构化字段。
  // settled 在 status 已经收口（success；error 已经在上面分支提前 return）时为 true，
  // 子卡据此把骨架切静态空态，停止永远转的骨架动画。
  if (message.hasToolStart || hasTripCardData) {
    const settled = message.status === 'success';
    return (
      <div>
        <AssistantHeader time={time} />
        <TripCardView
          weather={message.weather}
          attractions={message.attractions}
          card={message.card}
          settled={settled}
          onChipClick={onChipClick}
        />
      </div>
    );
  }

  // 兜底：纯 markdown 文本回复（闲聊 / 拒绝）。
  return (
    <div>
      <AssistantHeader time={time} />
      <Bubble
        placement="start"
        variant="outlined"
        content={message.content}
        contentRender={renderMarkdown}
      />
    </div>
  );
}
