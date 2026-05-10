import './TopBar.less';

/** TopBar Props */
export interface TopBarProps {
  /** 会话标题（默认 "漫游 · 旅行建议"，由 ChatPage 派生）。 */
  title: string;
  /** 当前消息数量（包括 user + assistant）。 */
  messageCount: number;
  /** 最后一次更新时间（取最近一条消息）。 */
  updatedAt: Date;
  /** 在线状态（保留为 props，便于未来对接连通性检测）。 */
  online?: boolean;
  /** 是否渲染移动端侧边栏入口。 */
  showSidebarTrigger?: boolean;
  /** 点击移动端侧边栏入口时触发。 */
  onOpenSidebar?: () => void;
}

/** 把 Date 格式化成 HH:mm，TopBar meta 行使用。 */
function formatHHMM(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function MenuIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

/** 吸顶 TopBar。左侧标题 + meta，右侧在线状态胶囊。 */
export function TopBar({
  title,
  messageCount,
  updatedAt,
  online = true,
  showSidebarTrigger = false,
  onOpenSidebar,
}: TopBarProps) {
  return (
    <div className="travel-topbar">
      <div className="travel-topbar__inner">
        {showSidebarTrigger ? (
          <button
            className="travel-topbar__menu"
            type="button"
            aria-label="打开对话记录"
            onClick={onOpenSidebar}
          >
            <MenuIcon />
          </button>
        ) : null}

        <div className="travel-topbar__title-block">
          <div className="travel-topbar__title">{title}</div>
          <div className="travel-topbar__meta">
            THREAD · {messageCount} MESSAGES · UPDATED {formatHHMM(updatedAt)}
          </div>
        </div>

        <span className={`travel-topbar__status ${online ? 'is-online' : 'is-offline'}`}>
          <span className="travel-topbar__status-dot" />
          {online ? '在线 · 天气数据实时' : '离线'}
        </span>
        {showSidebarTrigger ? (
          <span className="travel-topbar__mobile-spacer" aria-hidden="true" />
        ) : null}
      </div>
    </div>
  );
}
