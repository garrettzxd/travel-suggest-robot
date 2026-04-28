import type { CSSProperties } from 'react';
import { Skeleton } from 'antd';
import { CardContainer } from '../CardContainer';
import type { Attraction } from '../../../types';
import './AttractionList.less';

type AttractionImageStyle = CSSProperties & { '--attraction-image'?: string };

/** 地图线性图标，用于景点推荐卡 header。 */
function MapIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
      className="travel-attraction-list__icon"
    >
      <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2V6z" />
      <path d="M9 4v16M15 6v16" />
    </svg>
  );
}

/** AttractionList Props */
export interface AttractionListProps {
  /** 景点裸数据；缺失时整张卡进入骨架态。 */
  items?: Attraction[];
  /** 显式控制骨架；不传时由 !items 决定。 */
  loading?: boolean;
  /** 骨架条数。 */
  placeholderCount?: number;
  /** 本轮回复是否已完结。settled+无数据时切"未取到景点"静态空态。 */
  settled?: boolean;
}

/** 单条景点行的渲染。description 可选，缺失时占位单行 loading。 */
function AttractionRow({ item }: { item: Attraction }) {
  const imageStyle: AttractionImageStyle | undefined = item.imageUrl
    ? { '--attraction-image': `url(${item.imageUrl})` }
    : undefined;

  return (
    <div className="travel-attraction-row">
      <div
        className={`travel-attraction-row__image ${item.imageUrl ? 'has-image' : 'placeholder-stripe'}`}
        style={imageStyle}
      >
        {!item.imageUrl ? <span>IMG</span> : null}
      </div>

      <div className="travel-attraction-row__body">
        <div className="travel-attraction-row__head">
          <span className="travel-attraction-row__name">{item.name}</span>
          <span className="travel-attraction-row__tag">{item.category}</span>
        </div>

        {item.description ? (
          <div className="travel-attraction-row__desc">{item.description}</div>
        ) : (
          <div className="travel-attraction-row__desc-skeleton">
            <Skeleton.Input active size="small" className="travel-attraction-row__desc-skeleton-line" />
          </div>
        )}
      </div>

      <div className="travel-attraction-row__meta">
        {item.rating !== undefined ? (
          <span className="travel-attraction-row__rating">★ {item.rating.toFixed(1)}</span>
        ) : (
          <span className="travel-attraction-row__rating is-muted">暂无评分</span>
        )}
        <span className="travel-attraction-row__distance">
          {item.distanceKm !== undefined ? `${item.distanceKm.toFixed(1)} km` : item.address}
        </span>
      </div>
    </div>
  );
}

/** 景点骨架列表。 */
function ListSkeleton({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className="travel-attraction-skeleton">
          <Skeleton.Avatar active shape="square" className="travel-attraction-skeleton__image" />
          <div className="travel-attraction-skeleton__body">
            <Skeleton.Input active size="small" />
            <Skeleton paragraph={{ rows: 1, width: '80%' }} title={false} active />
          </div>
          <Skeleton.Input active size="small" className="travel-attraction-skeleton__rating" />
        </div>
      ))}
    </>
  );
}

/** 景点列表卡。骨架 → 裸数据 → narrative 三段渐进。 */
export function AttractionList({
  items,
  loading,
  placeholderCount = 5,
  settled,
}: AttractionListProps) {
  const isLoading = loading ?? !items;
  const isEmpty = isLoading && settled;

  return (
    <CardContainer padding="none" elevated={false} className="travel-attraction-list">
      <div className="travel-attraction-list__header">
        <div className="travel-attraction-list__title-group">
          <MapIcon />
          <span className="travel-attraction-list__title">值得停留的地方</span>
        </div>
        <span className="travel-attraction-list__count">
          {items?.length ? `${items.length} / 精选` : '精选地点'}
        </span>
      </div>

      {isEmpty ? (
        <div className="travel-attraction-list__empty">景点接口暂未返回数据</div>
      ) : isLoading || !items ? (
        <ListSkeleton count={placeholderCount} />
      ) : (
        <div className="travel-attraction-list__items">
          {items.map((item) => (
            <AttractionRow key={item.name} item={item} />
          ))}
        </div>
      )}
    </CardContainer>
  );
}
