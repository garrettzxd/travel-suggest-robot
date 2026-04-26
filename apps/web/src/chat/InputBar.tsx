import { Sender } from '@ant-design/x';
import { colors, layout, spacing } from '../theme/tokens';

/** InputBar Props */
export interface InputBarProps {
  /** 输入框当前值。 */
  value: string;
  /** 输入框值变更。 */
  onChange: (next: string) => void;
  /** 提交回调，与父级 ChatPage 的 onRequest 同路径。 */
  onSubmit: (value: string) => void;
  /** 是否处于发送中（绑定到 Sender 的 loading）。 */
  loading?: boolean;
}

/**
 * 吸底输入栏：包装 AntD X 的 Sender，叠加上方渐变分隔线 + 下方 helper hint。
 * 用 sticky + 半透明背景 + backdrop-filter 形成与聊天区的过渡，
 * 避免最后一条消息被遮挡（外层 ScrollArea 已留 padding-bottom）。
 */
export function InputBar({ value, onChange, onSubmit, loading }: InputBarProps) {
  return (
    <div
      style={{
        position: 'sticky',
        bottom: 0,
        zIndex: 10,
        background: 'rgba(250, 250, 247, 0.92)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderTop: `1px solid ${colors.stroke}`,
      }}
    >
      <div
        style={{
          maxWidth: layout.contentMaxWidth,
          margin: '0 auto',
          padding: `${spacing.sm}px ${spacing.md}px ${spacing.md}px`,
          display: 'flex',
          flexDirection: 'column',
          gap: spacing.xs,
        }}
      >
        <Sender
          value={value}
          onChange={onChange}
          onSubmit={onSubmit}
          loading={loading}
          placeholder="想去哪里？告诉我城市、时段或一种心情…"
        />
        <div
          style={{
            textAlign: 'center',
            fontSize: 11,
            color: colors.inkMuted,
            letterSpacing: '0.06em',
          }}
        >
          按 ENTER 发送 · SHIFT + ENTER 换行 · 天气数据来自公开气象 API
        </div>
      </div>
    </div>
  );
}
