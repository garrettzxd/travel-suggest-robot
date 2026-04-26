import { CardContainer } from './CardContainer';
import { colors, radius, spacing, tagPalette } from '../../theme/tokens';

/** 单个能力面板的视觉描述。 */
interface CapabilityItem {
  /** 标题，如 "景点推荐" */
  title: string;
  /** 副标，弱化文字 */
  subtitle: string;
  /** 圆形图标内的 emoji / 字符（轻量，避免引入图标库） */
  icon: string;
  /** tag 软色板 key */
  tone: keyof typeof tagPalette;
}

/** 三块固定能力面板，文案与配色按 PRD §5.2 / §7.3.2 锁定。 */
const CAPABILITIES: CapabilityItem[] = [
  { title: '景点推荐', subtitle: '值得打卡的去处', icon: '⌖', tone: 'pink' },
  { title: '天气查询', subtitle: '实时 + 7 日预报', icon: '☁', tone: 'blue' },
  { title: '出行建议', subtitle: '季节与当季贴士', icon: '✦', tone: 'sand' },
];

/**
 * 渲染单个能力面板。基于 CardContainer，仅通过 backgroundColor 区分粉/浅蓝/沙色。
 * 自身不触发任何点击交互，避免误发请求；后续如需启用建议提示再扩展。
 */
function CapabilityPanel({ item }: { item: CapabilityItem }) {
  const palette = tagPalette[item.tone];
  return (
    <CardContainer
      backgroundColor={palette.bg}
      bordered={false}
      elevated={false}
      padding={spacing.md}
      style={{ flex: 1, minWidth: 0 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: 'rgba(255, 255, 255, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: palette.fg,
            fontSize: 16,
            fontWeight: 600,
            lineHeight: 1,
          }}
        >
          {item.icon}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: palette.fg }}>
            {item.title}
          </div>
          <div
            style={{
              fontSize: 12,
              color: palette.fg,
              opacity: 0.78,
              marginTop: 2,
            }}
          >
            {item.subtitle}
          </div>
        </div>
      </div>
    </CardContainer>
  );
}

/** WelcomeCard 顶部的"漫游助手"头像 + 标题 + 时间戳信息行。 */
function WelcomeHeader({ time }: { time: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
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
      <span style={{ fontSize: 13, fontWeight: 600, color: colors.ink }}>
        漫游助手
      </span>
      <span style={{ fontSize: 12, color: colors.inkMuted }}>{time}</span>
    </div>
  );
}

/** WelcomeCard Props */
export interface WelcomeCardProps {
  /** 显示在头部的时间戳，默认按当前时间格式化为 HH:MM。 */
  time?: string;
  /** 引导语下方"快捷示例"按钮列表；不提供则不渲染。点击触发 onSuggestionClick。 */
  suggestions?: string[];
  /** 点击建议项的回调；当前能力面板本身不触发请求，仅 suggestions 触发。 */
  onSuggestionClick?: (text: string) => void;
}

/** 当前时间 HH:MM 格式化，仅用于 WelcomeCard 头部展示。 */
function formatNowHHMM(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

/**
 * 新会话默认欢迎卡片。仅在 messages.length === 0 时渲染，不进入 messages 数组。
 * 结构（PRD §7.3.2）：欢迎语 + 三列能力面板 + 虚线分隔 + 底部引导语。
 * suggestions 为可选扩展位（PRD 提到"若后续恢复示例 prompt 则放在引导语下方"）。
 */
export function WelcomeCard({
  time = formatNowHHMM(),
  suggestions,
  onSuggestionClick,
}: WelcomeCardProps) {
  return (
    <CardContainer>
      <WelcomeHeader time={time} />

      <p
        style={{
          marginTop: spacing.md,
          marginBottom: 0,
          fontSize: 15,
          lineHeight: 1.7,
          color: colors.ink,
        }}
      >
        你好，欢迎踏上新的旅程。我是 <strong>漫游</strong>
        ——你的行程规划伙伴，擅长把一个城市名字变成一份可执行的出行建议。
      </p>

      <div
        style={{
          display: 'flex',
          gap: spacing.sm,
          marginTop: spacing.md,
          flexWrap: 'wrap',
        }}
      >
        {CAPABILITIES.map((item) => (
          <CapabilityPanel key={item.title} item={item} />
        ))}
      </div>

      <div
        style={{
          marginTop: spacing.md,
          borderTop: `1px dashed ${colors.stroke}`,
          paddingTop: spacing.sm,
          fontSize: 13,
          color: colors.inkMuted,
        }}
      >
        告诉我想去的城市或地区，或试试下方的建议 ↓
      </div>

      {suggestions && suggestions.length > 0 ? (
        <div
          style={{
            marginTop: spacing.sm,
            display: 'flex',
            flexWrap: 'wrap',
            gap: spacing.xs,
          }}
        >
          {suggestions.map((text) => (
            <button
              key={text}
              type="button"
              onClick={() => onSuggestionClick?.(text)}
              style={{
                border: `1px solid ${colors.stroke}`,
                background: colors.surface,
                color: colors.ink,
                fontSize: 13,
                padding: '6px 12px',
                borderRadius: radius.chip,
                cursor: 'pointer',
              }}
            >
              → {text}
            </button>
          ))}
        </div>
      ) : null}
    </CardContainer>
  );
}
