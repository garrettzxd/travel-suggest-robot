import { Skeleton } from 'antd';
import { CardContainer } from './CardContainer';
import type { TripCard } from '../../types';
import {
  colors,
  radius,
  spacing,
  verdictColor,
  type VerdictCode,
} from '../../theme/tokens';

/** RecommendationPanel Props */
export interface RecommendationPanelProps {
  /** narrative 部分（pill tag / headline / body）。 */
  data?: TripCard['recommendation'];
  /**
   * verdict 枚举：good / caution / avoid。来自 hero.verdictBadge，由 TripCardView 透传。
   * pill 颜色按此映射；缺失或非法值时退到 brand 绿底。
   */
  verdict?: string;
  /** 显式骨架；不传时由 !data 决定。 */
  loading?: boolean;
  /** 本轮回复是否已完结。settled+无数据时切静态空态，停止骨架动画。 */
  settled?: boolean;
}

/** 把任意字符串收敛到 VerdictCode，非法值返回 undefined（pill 退到默认色）。 */
function normalizeVerdict(value: string | undefined): VerdictCode | undefined {
  if (value === 'good' || value === 'caution' || value === 'avoid') return value;
  return undefined;
}

/**
 * 给 body 中的 M/D 日期加 mark 高亮。LLM 按 prompt 要求会写成 "4/26" 这种格式。
 * 用最朴素的正则：`(\d{1,2}/\d{1,2})`，匹配到的部分套 mark 标签（黄底）。
 */
function renderBodyWithDateHighlight(body: string) {
  const parts = body.split(/(\d{1,2}\/\d{1,2})/g);
  return parts.map((part, idx) => {
    if (/^\d{1,2}\/\d{1,2}$/.test(part)) {
      return (
        <mark
          key={idx}
          style={{
            background: '#FFF1A8',
            color: colors.ink,
            padding: '0 4px',
            borderRadius: 3,
          }}
        >
          {part}
        </mark>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

/**
 * 顶部 pill 标签：紧凑胶囊，跟在 headline 同一行内联展示，不占整行宽度。
 * pill 颜色由 verdict 驱动（good=绿/caution=琥珀/avoid=红），与 DestinationHero 右上角 badge 同步。
 * 文本来自 LLM 提供的 `tag`（如"推荐 · 近期出发"），prompt 已要求与 verdict 语义一致。
 */
function PillTag({ text, verdict }: { text: string; verdict?: VerdictCode }) {
  const palette = verdict ? verdictColor[verdict] : { bg: colors.brandSoft, fg: colors.brand };
  return (
    <span
      style={{
        background: palette.bg,
        color: palette.fg,
        fontSize: 12,
        fontWeight: 600,
        padding: '4px 10px',
        borderRadius: radius.chip,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: palette.fg,
        }}
      />
      {text}
    </span>
  );
}

/**
 * 出行建议卡：pill + headline（同一行）+ body。
 * chips 已迁出该卡片，由 TripCardView 在卡下方独立渲染。
 * pill 颜色由 verdict 驱动；数据缺失时整张卡骨架；settled+无数据时切静态空态。
 */
export function RecommendationPanel({
  data,
  verdict,
  loading,
  settled,
}: RecommendationPanelProps) {
  const isLoading = loading ?? !data;
  const isEmpty = isLoading && settled;
  const verdictCode = normalizeVerdict(verdict);

  return (
    <CardContainer>
      {isEmpty ? (
        <div
          style={{
            padding: `${spacing.md}px 0`,
            color: colors.inkSubtle,
            fontSize: 13,
            textAlign: 'center',
          }}
        >
          未生成出行建议
        </div>
      ) : isLoading || !data ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
            <Skeleton.Button active size="small" style={{ width: 110, height: 22, borderRadius: 999 }} />
            <Skeleton.Input active size="small" style={{ width: 140, height: 22 }} />
          </div>
          <Skeleton paragraph={{ rows: 2, width: ['100%', '85%'] }} title={false} active />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: spacing.sm,
              flexWrap: 'wrap',
            }}
          >
            <PillTag text={data.tag} verdict={verdictCode} />
            <h3
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 700,
                color: colors.ink,
              }}
            >
              {data.headline}
            </h3>
          </div>
          <p
            style={{
              margin: 0,
              fontSize: 14,
              lineHeight: 1.7,
              color: colors.ink,
            }}
          >
            {renderBodyWithDateHighlight(data.body)}
          </p>
        </div>
      )}
    </CardContainer>
  );
}
