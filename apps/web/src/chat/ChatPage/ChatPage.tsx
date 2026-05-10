import { useEffect, useMemo, useRef, useState } from 'react';
import { Bubble } from '@ant-design/x';
import type { BubbleProps } from '@ant-design/x';
import XMarkdown from '@ant-design/x-markdown';
import { Drawer, Typography } from 'antd';
import type { ConversationListItem } from '@travel/shared';
import { getConversation, listConversations } from '../../api/client';
import { useAuth } from '../../auth/useAuth';
import { TopBar } from '../TopBar';
import { ConversationSidebar } from '../ConversationSidebar';
import { InputBar } from '../InputBar';
import { WelcomeCard } from '../cards/WelcomeCard';
import { TripCardView } from '../cards/TripCardView';
import { ItineraryCard } from '../cards/ItineraryCard';
import { useTravelAgent, type TravelChatMessage } from '../useTravelAgent';
import './ChatPage.less';

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

/** 用户气泡：深墨色底 + 白字，右对齐。 */
function UserBubble({ content }: { content: string }) {
  return (
    <div className="travel-user-message">
      <div className="travel-user-bubble">{content}</div>
    </div>
  );
}

/** assistant 顶部信息行：圆形头像 + "漫游助手" 名 + 创建时间。 */
function AssistantHeader({ time }: { time: string }) {
  return (
    <div className="travel-assistant-header">
      <div className="travel-assistant-avatar">漫</div>
      <span className="travel-assistant-name">漫游助手</span>
      <span className="travel-assistant-time">{time}</span>
    </div>
  );
}

/** 把消息 id 中的时间戳还原为 Date，用作 assistant header 的小时分钟显示。 */
function deriveMessageTime(id: string, createdAt?: number): string {
  const ts = Number(id.split('-')[1]);
  const date = typeof createdAt === 'number' && Number.isFinite(createdAt)
    ? new Date(createdAt)
    : Number.isFinite(ts)
      ? new Date(ts)
      : new Date();
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
  const { user } = useAuth();
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [activeConversation, setActiveConversation] = useState<ConversationListItem | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const refreshConversationsRef = useRef<() => Promise<void>>(async () => undefined);
  const {
    messages,
    onRequest,
    isRequesting,
    conversationId,
    loadConversation,
    resetConversation,
  } = useTravelAgent({
    onConversationResolved: ({ conversationId: nextId }) => {
      setActiveConversation((prev) =>
        prev?.id === nextId
          ? prev
          : conversations.find((item) => item.id === nextId) ?? prev,
      );
    },
    onRequestSettled: () => {
      void refreshConversationsRef.current();
    },
  });
  const [inputValue, setInputValue] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const shouldStickToBottomRef = useRef(true);

  const openMobileSidebar = () => setMobileSidebarOpen(true);
  const closeMobileSidebar = () => setMobileSidebarOpen(false);

  useEffect(() => {
    refreshConversationsRef.current = async () => {
      if (!user) return;
      setConversationsLoading(true);
      try {
        const { items } = await listConversations();
        setConversations(items);
        setActiveConversation((prev) => {
          if (conversationId) return items.find((item) => item.id === conversationId) ?? prev;
          if (!prev) return null;
          return items.find((item) => item.id === prev.id) ?? prev;
        });
      } finally {
        setConversationsLoading(false);
      }
    };
  }, [conversationId, user]);

  useEffect(() => {
    if (!user) return;
    void refreshConversationsRef.current();
  }, [user]);

  // 只有用户本来就在底部附近时才自动跟随流式更新；用户上滑查看卡片时保持当前位置。
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !shouldStickToBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  const lastUpdatedAt = useMemo(() => {
    const last = messages[messages.length - 1];
    if (!last) return activeConversation ? new Date(activeConversation.updatedAt) : new Date();
    if (last.createdAt) return new Date(last.createdAt);
    const ts = Number(last.id.split('-')[1]);
    return Number.isFinite(ts) ? new Date(ts) : new Date();
  }, [activeConversation, messages]);

  const title = useMemo(() => {
    if (messages.length > 0) return deriveTitle(messages);
    return activeConversation?.title || '漫游 · 旅行建议';
  }, [activeConversation, messages]);

  /** 提交后立刻清空输入框，请求生命周期交给 useTravelAgent 管理。 */
  const handleSubmit = (value: string) => {
    const text = value.trim();
    if (!text) return;
    shouldStickToBottomRef.current = true;
    setInputValue('');
    onRequest(text);
  };

  const handleSelectConversation = async (conversation: ConversationListItem) => {
    if (conversation.id === conversationId && !conversationLoading) {
      closeMobileSidebar();
      return;
    }
    closeMobileSidebar();
    setConversationLoading(true);
    shouldStickToBottomRef.current = true;
    try {
      const detail = await getConversation(conversation.id);
      setActiveConversation({
        ...detail.conversation,
        lastMessagePreview: conversation.lastMessagePreview,
      });
      loadConversation(detail.conversation.id, detail.messages);
    } finally {
      setConversationLoading(false);
    }
  };

  const handleNewConversation = () => {
    closeMobileSidebar();
    setActiveConversation(null);
    setInputValue('');
    shouldStickToBottomRef.current = true;
    resetConversation();
  };

  /** 记录用户是否仍贴近底部，用于决定后续流式数据是否需要自动滚动。 */
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    shouldStickToBottomRef.current = distanceToBottom < 96;
  };

  if (!user) {
    return <div className="travel-chat-loading">正在载入漫游…</div>;
  }

  return (
    <div className="travel-chat-shell">
      <aside className="travel-history-sidebar">
        <ConversationSidebar
          user={user}
          conversations={conversations}
          activeConversationId={conversationId}
          conversationsLoading={conversationsLoading}
          onNewConversation={handleNewConversation}
          onSelectConversation={handleSelectConversation}
        />
      </aside>

      <Drawer
        placement="left"
        open={mobileSidebarOpen}
        onClose={closeMobileSidebar}
        width="min(74vw, 292px)"
        closable={false}
        rootClassName="travel-mobile-sidebar-drawer"
      >
        <ConversationSidebar
          user={user}
          conversations={conversations}
          activeConversationId={conversationId}
          conversationsLoading={conversationsLoading}
          onNewConversation={handleNewConversation}
          onSelectConversation={handleSelectConversation}
        />
      </Drawer>

      <main className="travel-chat-page">
        <TopBar
          title={title}
          messageCount={messages.length}
          updatedAt={lastUpdatedAt}
          online
          showSidebarTrigger
          onOpenSidebar={openMobileSidebar}
        />

        <div ref={scrollRef} onScroll={handleScroll} className="travel-chat-scroll">
          <div className="travel-chat-content">
            {conversationLoading ? (
              <div className="travel-chat-state">正在打开历史对话…</div>
            ) : messages.length === 0 ? (
              <WelcomeCard onSuggestionClick={handleSubmit} />
            ) : (
              messages.map((message) => (
                <MessageRow
                  key={message.id}
                  message={message}
                  onChipClick={handleSubmit}
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
      </main>
    </div>
  );
}

/**
 * 单条消息分发：user → UserBubble；assistant 视数据可用性走结构化卡片或 markdown 兜底。
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

  const time = deriveMessageTime(message.id, message.createdAt);
  const hasTripCardData = !!(
    message.weather ||
    message.attractions ||
    message.progressiveCard ||
    message.card
  );
  const hasStructured = !!(hasTripCardData || message.itinerary);

  if (message.status === 'error') {
    return (
      <div className="travel-assistant-message travel-assistant-message--error">
        <AssistantHeader time={time} />
        <Bubble
          placement="start"
          variant="outlined"
          content={message.content || '请求失败'}
          contentRender={renderMarkdown}
          className="travel-error-bubble"
        />
      </div>
    );
  }

  if (message.status === 'loading' && !hasStructured && !message.hasToolStart) {
    return (
      <div className="travel-assistant-message">
        <AssistantHeader time={time} />
        <Bubble placement="start" variant="outlined" loading content="" />
      </div>
    );
  }

  if (message.itinerary && !message.card) {
    return (
      <div className="travel-assistant-message">
        <AssistantHeader time={time} />
        <ItineraryCard {...message.itinerary} />
      </div>
    );
  }

  if (message.hasToolStart || hasTripCardData) {
    const settled = message.status === 'success';
    // 仅 weather-only（没进 finalizeTripCard 渐进流，且工具集合里只有 getWeather）时，
    // 把 final 文本回填到 WeatherCard 的"整体评估"槽，避免 narrative 被吞掉。
    const onlyWeatherTool =
      !!message.toolsStarted &&
      message.toolsStarted.length > 0 &&
      message.toolsStarted.every((name) => name === 'getWeather');
    // inCardFlow 必须按 hero / recommendation 判定，否则 weather-only 流的 progressiveCard.weather 也会误判。
    const inCardFlow = !!(
      message.card ||
      message.progressiveCard?.hero ||
      message.progressiveCard?.recommendation
    );
    const fallbackNarrative =
      onlyWeatherTool && !inCardFlow && message.content ? message.content : undefined;
    return (
      <div className="travel-assistant-message">
        <AssistantHeader time={time} />
        <TripCardView
          weather={message.weather}
          attractions={message.attractions}
          card={message.card}
          progressiveCard={message.progressiveCard}
          settled={settled}
          onChipClick={onChipClick}
          toolsStarted={message.toolsStarted}
          fallbackNarrative={fallbackNarrative}
        />
      </div>
    );
  }

  return (
    <div className="travel-assistant-message">
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
