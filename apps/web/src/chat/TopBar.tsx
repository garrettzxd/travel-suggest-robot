import { colors, layout, radius, spacing } from '../theme/tokens';

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

/**
 * 吸顶 TopBar。左侧标题 + meta（THREAD · X MESSAGES · UPDATED HH:mm），
 * 右侧"在线"绿底胶囊。整条 Bar 用 sticky + flex 列布局保证不遮内容。
 */
export function TopBar({ title, messageCount, updatedAt, online = true }: TopBarProps) {
  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        height: layout.topBarHeight,
        background: colors.bg,
        borderBottom: `1px solid ${colors.stroke}`,
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: layout.contentMaxWidth,
          margin: '0 auto',
          padding: `0 ${spacing.md}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.md,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: colors.ink,
              lineHeight: 1.2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontSize: 11,
              color: colors.inkMuted,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              marginTop: 2,
            }}
          >
            THREAD · {messageCount} MESSAGES · UPDATED {formatHHMM(updatedAt)}
          </div>
        </div>

        <span
          style={{
            background: online ? colors.brandSoft : colors.surfaceAlt,
            color: online ? colors.brand : colors.inkMuted,
            fontSize: 12,
            fontWeight: 600,
            padding: '6px 12px',
            borderRadius: radius.chip,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            whiteSpace: 'nowrap',
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: online ? colors.brand : colors.inkMuted,
            }}
          />
          {online ? '在线 · 天气数据实时' : '离线'}
        </span>
      </div>
    </div>
  );
}
