import { Skeleton } from 'antd';
import { CardContainer } from '../CardContainer';
import type { TripCard } from '../../../types';
import type { VerdictCode } from '../../../theme/tokens';
import './RecommendationPanel.less';

/** RecommendationPanel Props */
export interface RecommendationPanelProps {
  /** narrative 部分（pill tag / headline / body）。 */
  data?: TripCard['recommendation'];
  /** verdict 枚举：good / caution / avoid。来自 hero.verdictBadge，由 TripCardView 透传。 */
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

/** 给 body 中的 M/D 日期加 mark 高亮。 */
function renderBodyWithDateHighlight(body: string) {
  const parts = body.split(/(\d{1,2}\/\d{1,2})/g);
  return parts.map((part, idx) => {
    if (/^\d{1,2}\/\d{1,2}$/.test(part)) {
      return (
        <mark key={idx} className="travel-recommendation__date-mark">
          {part}
        </mark>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

/** 顶部 pill 标签。 */
function PillTag({ text, verdict }: { text: string; verdict?: VerdictCode }) {
  return (
    <span className={`travel-recommendation__pill ${verdict ? `is-${verdict}` : 'is-default'}`}>
      <span className="travel-recommendation__pill-dot" />
      {text}
    </span>
  );
}

/** 出行建议卡：pill + headline（同一行）+ body。 */
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
        <div className="travel-recommendation__empty">未生成出行建议</div>
      ) : isLoading || !data ? (
        <div className="travel-recommendation__skeleton">
          <div className="travel-recommendation__skeleton-head">
            <Skeleton.Button active size="small" className="travel-recommendation__skeleton-pill" />
            <Skeleton.Input active size="small" className="travel-recommendation__skeleton-title" />
          </div>
          <Skeleton paragraph={{ rows: 2, width: ['100%', '85%'] }} title={false} active />
        </div>
      ) : (
        <div className="travel-recommendation__content">
          <div className="travel-recommendation__head">
            <PillTag text={data.tag} verdict={verdictCode} />
            <h3 className="travel-recommendation__title">{data.headline}</h3>
          </div>
          <div className="travel-recommendation__body">{renderBodyWithDateHighlight(data.body)}</div>
        </div>
      )}
    </CardContainer>
  );
}
