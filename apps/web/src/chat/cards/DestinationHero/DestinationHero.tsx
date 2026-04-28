import type { CSSProperties } from 'react';
import { Skeleton } from 'antd';
import { CardContainer } from '../CardContainer';
import type { TripCard } from '../../../types';
import { verdictBadgeLabel, type VerdictCode } from '../../../theme/tokens';
import './DestinationHero.less';

type HeroMediaStyle = CSSProperties & { '--hero-image'?: string };

/** verdictBadge 枚举 → 视觉色板。 */
function isVerdictCode(value: string | undefined): value is VerdictCode {
  return value === 'good' || value === 'caution' || value === 'avoid';
}

/** Hero Props（数据来自 TripCard.hero）。 */
export interface DestinationHeroProps {
  /** 完整的 hero narrative；缺失时进入骨架态。 */
  data?: TripCard['hero'];
  /** 显式控制骨架；不传时由 !data 决定。 */
  loading?: boolean;
  /** settled=true 且 data 仍缺失时，停止骨架动画切静态空态。 */
  settled?: boolean;
}

/** 顶部地点 Hero 卡片。 */
export function DestinationHero({ data, loading, settled }: DestinationHeroProps) {
  const isLoading = loading ?? !data;
  const isEmpty = isLoading && settled;
  const heroImageUrl = data?.heroImageUrl;
  const mediaClassName = [
    'travel-destination-hero__media',
    heroImageUrl ? 'has-image' : 'placeholder-stripe',
  ].join(' ');
  const mediaStyle: HeroMediaStyle | undefined = heroImageUrl
    ? { '--hero-image': `url(${heroImageUrl})` }
    : undefined;

  return (
    <CardContainer padding="none">
      <div className={mediaClassName} style={mediaStyle}>
        {heroImageUrl ? <div className="travel-destination-hero__media-gradient" /> : null}

        {!heroImageUrl ? (
          <>
            <span className="travel-destination-hero__placeholder-label">PLACEHOLDER</span>
            <div className="travel-destination-hero__placeholder-center">
              {!isLoading ? <span>{data?.city ?? ''} · HERO IMAGE</span> : null}
            </div>
          </>
        ) : null}

        {heroImageUrl && !isLoading ? (
          <span className="travel-destination-hero__image-label">{data?.city ?? ''} · HERO</span>
        ) : null}
      </div>

      <div className="travel-destination-hero__body">
        <div className="travel-destination-hero__copy">
          {isEmpty ? (
            <>
              <div className="travel-destination-hero__eyebrow is-empty">LOCATION</div>
              <h2 className="travel-destination-hero__title is-empty">未生成地点总结</h2>
              <div className="travel-destination-hero__desc is-empty">
                助手未能完成行程卡的生成，可重新发送或换个地名再试。
              </div>
            </>
          ) : isLoading ? (
            <div className="travel-destination-hero__skeleton">
              <Skeleton.Input active size="small" className="travel-destination-hero__skeleton-eyebrow" />
              <Skeleton.Input active size="large" className="travel-destination-hero__skeleton-title" />
              <Skeleton paragraph={{ rows: 1, width: '70%' }} title={false} active />
            </div>
          ) : (
            <>
              <div className="travel-destination-hero__eyebrow">
                {data?.regionCode} · {data?.regionPath}
              </div>
              <h2 className="travel-destination-hero__title">{data?.city}</h2>
              <div className="travel-destination-hero__desc">{data?.tagline}</div>
            </>
          )}
        </div>

        {isEmpty ? null : isLoading ? (
          <Skeleton.Button active size="small" className="travel-destination-hero__badge-skeleton" />
        ) : (
          <VerdictBadge code={data?.verdictBadge} />
        )}
      </div>
    </CardContainer>
  );
}

/** 渲染 verdict 状态胶囊：good / caution / avoid 对应不同色板，未知值不渲染。 */
function VerdictBadge({ code }: { code?: string }) {
  if (!isVerdictCode(code)) return null;
  const label = verdictBadgeLabel[code];
  return (
    <span className={`travel-verdict-badge is-${code}`}>
      <span className="travel-verdict-badge__dot" />
      {label}
    </span>
  );
}
