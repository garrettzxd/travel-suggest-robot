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
}

/** 把 Date 格式化成 HH:mm，TopBar meta 行使用。 */
function formatHHMM(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** 吸顶 TopBar。左侧标题 + meta，右侧在线状态胶囊。 */
export function TopBar({ title, messageCount, updatedAt, online = true }: TopBarProps) {
  return (
    <div className="travel-topbar">
      <div className="travel-topbar__inner">
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
      </div>
    </div>
  );
}
