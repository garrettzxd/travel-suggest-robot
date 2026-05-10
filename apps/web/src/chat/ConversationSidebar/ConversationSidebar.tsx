import type { AuthUser, ConversationListItem } from '@travel/shared';
import './ConversationSidebar.less';

export interface ConversationSidebarProps {
  user: AuthUser;
  conversations: ConversationListItem[];
  activeConversationId: string | null;
  conversationsLoading: boolean;
  onNewConversation: () => void;
  onSelectConversation: (conversation: ConversationListItem) => void | Promise<void>;
}

function CompassIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5l-2 5-5 2 2-5 5-2z" fill="currentColor" fillOpacity="0.15" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="10"
      height="10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function formatRelativeTime(value: number): string {
  const diff = Date.now() - value;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return '刚刚';
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < day * 7) return `${Math.floor(diff / day)} 天前`;
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(value);
}

function getUserInitial(user?: AuthUser | null): string {
  const source = user?.username || user?.email || 'Z';
  return source.trim().slice(0, 1).toUpperCase();
}

/** 对话记录侧边栏内容，供 PC 常驻侧栏与移动端抽屉复用。 */
export function ConversationSidebar({
  user,
  conversations,
  activeConversationId,
  conversationsLoading,
  onNewConversation,
  onSelectConversation,
}: ConversationSidebarProps) {
  return (
    <div className="travel-conversation-sidebar">
      <div className="travel-sidebar-brand">
        <div className="travel-sidebar-logo">
          <CompassIcon />
        </div>
        <div>
          <div className="travel-sidebar-title">漫游</div>
          <div className="travel-sidebar-subtitle">TRAVEL · AI</div>
        </div>
      </div>

      <button className="travel-new-thread" type="button" onClick={onNewConversation}>
        <PlusIcon />
        开启新旅程
      </button>

      <div className="travel-thread-section-label">近期对话</div>
      <div className="travel-thread-list">
        {conversationsLoading && conversations.length === 0 ? (
          <div className="travel-thread-empty">正在同步历史记录…</div>
        ) : conversations.length === 0 ? (
          <div className="travel-thread-empty">还没有历史对话</div>
        ) : (
          conversations.map((conversation) => (
            <button
              key={conversation.id}
              className={`travel-thread-item ${
                conversation.id === activeConversationId ? 'is-active' : ''
              }`}
              type="button"
              onClick={() => void onSelectConversation(conversation)}
            >
              <span className="travel-thread-title">{conversation.title}</span>
              <span className="travel-thread-meta">
                <ClockIcon />
                {formatRelativeTime(conversation.updatedAt)}
              </span>
            </button>
          ))
        )}
      </div>

      <div className="travel-sidebar-user">
        <div className="travel-sidebar-avatar">{getUserInitial(user)}</div>
        <div className="travel-sidebar-user-main">
          <div className="travel-sidebar-username">{user.username}</div>
          <div className="travel-sidebar-email">已保存 {conversations.length} 段行程</div>
        </div>
      </div>
    </div>
  );
}
