import { Skeleton } from 'antd';
import { CardContainer } from './CardContainer';
import type { Attraction } from '../../types';
import { attractionTag, colors, radius, spacing } from '../../theme/tokens';

/** AttractionList Props */
export interface AttractionListProps {
  /** 景点裸数据；缺失时整张卡进入骨架态。 */
  items?: Attraction[];
  /** 显式骨架；不传时由 !items 决定。 */
  loading?: boolean;
  /** 骨架行数，默认 5。 */
  placeholderCount?: number;
  /** 本轮回复是否已完结。settled+无数据时切"未取到景点"静态空态。 */
  settled?: boolean;
}

/** 单条景点行的渲染。description 可选——缺失时占位单行 loading（在二阶段裸数据等待 narrative 时用）。 */
function AttractionRow({ item }: { item: Attraction }) {
  // 所有分类 tag 统一用 attractionTag 配色（#BEADE0 底 + 深紫文字），
  // 不按 category 分色，避免高德偶尔返回"购物服务""餐饮"这种非预期分类时颜色掉到灰。
  return (
    <div
      style={{
        display: 'flex',
        gap: spacing.sm,
        alignItems: 'flex-start',
        padding: `${spacing.sm}px 0`,
        borderTop: `1px solid ${colors.stroke}`,
      }}
    >
      {/* 缩略图：有 imageUrl 用图，否则斜纹底；统一 48×48。 */}
      <div
        className={item.imageUrl ? undefined : 'placeholder-stripe'}
        style={{
          width: 48,
          height: 48,
          borderRadius: 8,
          flexShrink: 0,
          background: item.imageUrl ? `center/cover no-repeat url(${item.imageUrl})` : undefined,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 10,
          color: colors.inkSubtle,
          letterSpacing: '0.12em',
        }}
      >
        {item.imageUrl ? null : 'IMG'}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: colors.ink }}>{item.name}</span>
          <span
            style={{
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: radius.chip,
              background: attractionTag.bg,
              color: attractionTag.fg,
              fontWeight: 500,
            }}
          >
            {item.category}
          </span>
        </div>
        <div
          style={{
            marginTop: 4,
            fontSize: 13,
            color: colors.inkMuted,
            lineHeight: 1.55,
          }}
        >
          {item.description ? (
            item.description
          ) : (
            <Skeleton paragraph={{ rows: 1, width: '70%' }} title={false} active />
          )}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 2,
          flexShrink: 0,
          minWidth: 60,
          textAlign: 'right',
        }}
      >
        {typeof item.rating === 'number' ? (
          <span style={{ fontSize: 13, color: '#C29200', fontWeight: 600 }}>
            ★ {item.rating.toFixed(1)}
          </span>
        ) : (
          <span style={{ fontSize: 13, color: colors.inkSubtle }}>—</span>
        )}
        <span style={{ fontSize: 12, color: colors.inkSubtle }}>
          {typeof item.distanceKm === 'number'
            ? item.distanceKm < 1
              ? '城中心'
              : `${item.distanceKm.toFixed(1)} km`
            : '—'}
        </span>
      </div>
    </div>
  );
}

/** 整张卡骨架：N 条统一行级骨架（缩略图 + 两行文字 + 右侧两行小字）。 */
function ListSkeleton({ count }: { count: number }) {
  return (
    <div>
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          style={{
            display: 'flex',
            gap: spacing.sm,
            alignItems: 'center',
            padding: `${spacing.sm}px 0`,
            borderTop: idx === 0 ? 'none' : `1px solid ${colors.stroke}`,
          }}
        >
          <Skeleton.Avatar active shape="square" size={48} />
          <div style={{ flex: 1 }}>
            <Skeleton paragraph={{ rows: 2, width: ['60%', '85%'] }} title={false} active />
          </div>
          <Skeleton.Input active size="small" style={{ width: 48, height: 14 }} />
        </div>
      ))}
    </div>
  );
}

/**
 * 景点列表卡。骨架 → 裸数据 → narrative 三段渐进。
 * settled+无数据时切静态空态（getAttractions 失败的兜底）。
 */
export function AttractionList({
  items,
  loading,
  placeholderCount = 5,
  settled,
}: AttractionListProps) {
  const isLoading = loading ?? !items;
  const isEmpty = isLoading && settled;

  return (
    <CardContainer>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: spacing.sm,
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 600, color: colors.ink }}>
          📍 值得停留的地方
        </span>
        <span style={{ fontSize: 12, color: colors.inkMuted }}>
          {!isLoading && items ? `${items.length} / 精选` : '— / 精选'}
        </span>
      </div>

      {isEmpty ? (
        <div
          style={{
            padding: `${spacing.md}px 0`,
            textAlign: 'center',
            color: colors.inkSubtle,
            fontSize: 13,
          }}
        >
          景点接口暂未返回数据
        </div>
      ) : isLoading || !items ? (
        <ListSkeleton count={placeholderCount} />
      ) : (
        <div>
          {items.map((item) => (
            <AttractionRow key={item.name} item={item} />
          ))}
        </div>
      )}
    </CardContainer>
  );
}
