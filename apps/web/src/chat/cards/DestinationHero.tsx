import { Skeleton } from 'antd';
import { CardContainer } from './CardContainer';
import type { TripCard } from '../../types';
import {
  colors,
  radius,
  spacing,
  verdictBadgeLabel,
  verdictColor,
  type VerdictCode,
} from '../../theme/tokens';

/** verdictBadge 枚举 → 视觉色板（颜色取自 verdictColor，文案取自 verdictBadgeLabel）。 */
function isVerdictCode(value: string | undefined): value is VerdictCode {
  return value === 'good' || value === 'caution' || value === 'avoid';
}

/** Hero Props（数据来自 TripCard.hero）。 */
export interface DestinationHeroProps {
  /** 完整的 hero narrative；缺失时进入骨架态。 */
  data?: TripCard['hero'];
  /** 显式控制骨架；不传时由 !data 决定。 */
  loading?: boolean;
  /**
   * 本轮回复是否已完结。settled=true 且 data 仍缺失时，停止骨架动画切静态空态，
   * 避免"骨架一直转"的视觉假象（PRD §7.4 card 缺失兜底）。
   */
  settled?: boolean;
}

/**
 * 顶部地点 Hero 卡片：占位斜纹图 + 行政区 breadcrumb + 大标题 + 一句 tagline + 出行 badge。
 * 骨架态展示 Hero 占位 + breadcrumb 与 title 的 Skeleton 行；data 到达后整体填入；
 * settled+无数据时切到"未生成总结"的静态空态。
 */
export function DestinationHero({ data, loading, settled }: DestinationHeroProps) {
  const isLoading = loading ?? !data;
  const isEmpty = isLoading && settled;

  // 优先用 Amap 提供的城市 Hero 图（来自第一张可用景点 photo）；缺失时降级到斜纹占位。
  const heroImageUrl = data?.heroImageUrl;

  return (
    <CardContainer padding={0}>
      {/* 顶部 hero：有图时渲染真实图片 + 底部暗色渐变（保证 city 文字在亮图上仍清晰）；无图时走斜纹占位。 */}
      <div
        className={heroImageUrl ? undefined : 'placeholder-stripe'}
        style={{
          height: 160,
          borderTopLeftRadius: radius.card,
          borderTopRightRadius: radius.card,
          position: 'relative',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'flex-start',
          overflow: 'hidden',
          background: heroImageUrl
            ? `center/cover no-repeat url(${heroImageUrl})`
            : undefined,
          color: heroImageUrl ? '#fff' : colors.inkSubtle,
          fontSize: 12,
          letterSpacing: '0.18em',
        }}
      >
        {heroImageUrl ? (
          // 真实图片：底部 1/3 暗色渐变，把城市名衬托出来。
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: '60%',
              background:
                'linear-gradient(to top, rgba(0,0,0,0.55), rgba(0,0,0,0))',
              pointerEvents: 'none',
            }}
          />
        ) : (
          // 占位标签 + 中心提示文字（仅 placeholder 模式）
          <>
            <span
              style={{
                position: 'absolute',
                top: spacing.sm,
                left: spacing.md,
                background: 'rgba(255,255,255,0.78)',
                padding: '2px 8px',
                borderRadius: 4,
                fontSize: 11,
                color: colors.inkMuted,
                letterSpacing: '0.16em',
              }}
            >
              PLACEHOLDER
            </span>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {!isLoading ? <span>{data?.city ?? ''} · HERO IMAGE</span> : null}
            </div>
          </>
        )}

        {/* 真实图片模式下在左下角渲染一个轻量小标，统一视觉锚点。 */}
        {heroImageUrl && !isLoading ? (
          <span
            style={{
              position: 'relative',
              zIndex: 1,
              padding: `${spacing.sm}px ${spacing.md}px`,
              fontSize: 12,
              fontWeight: 500,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.92)',
              textShadow: '0 1px 2px rgba(0,0,0,0.4)',
            }}
          >
            {data?.city ?? ''} · HERO
          </span>
        ) : null}
      </div>

      <div
        style={{
          padding: spacing.lg,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: spacing.md,
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          {isEmpty ? (
            // 静态空态：本轮已完结但没拿到 hero narrative，停止骨架动画显示占位文案。
            <>
              <div
                style={{
                  fontSize: 11,
                  color: colors.inkSubtle,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                }}
              >
                LOCATION
              </div>
              <h2
                style={{
                  margin: `${spacing.xs}px 0 ${spacing.xs}px`,
                  fontSize: 20,
                  fontWeight: 600,
                  color: colors.inkMuted,
                }}
              >
                未生成地点总结
              </h2>
              <div style={{ fontSize: 13, color: colors.inkSubtle, lineHeight: 1.6 }}>
                助手未能完成行程卡的生成，可重新发送或换个地名再试。
              </div>
            </>
          ) : isLoading ? (
            <>
              <Skeleton.Input active size="small" style={{ width: 200, height: 14 }} />
              <div style={{ marginTop: spacing.sm }}>
                <Skeleton.Input active size="large" style={{ width: 220, height: 28 }} />
              </div>
              <div style={{ marginTop: spacing.sm }}>
                <Skeleton paragraph={{ rows: 1, width: '70%' }} title={false} active />
              </div>
            </>
          ) : (
            <>
              <div
                style={{
                  fontSize: 11,
                  color: colors.inkMuted,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                }}
              >
                {data?.regionCode} · {data?.regionPath}
              </div>
              <h2
                style={{
                  margin: `${spacing.xs}px 0 ${spacing.xs}px`,
                  fontSize: 24,
                  fontWeight: 700,
                  color: colors.ink,
                  lineHeight: 1.25,
                }}
              >
                {data?.city}
              </h2>
              <div
                style={{
                  fontSize: 14,
                  color: colors.inkMuted,
                  lineHeight: 1.6,
                }}
              >
                {data?.tagline}
              </div>
            </>
          )}
        </div>

        {/* 右上角 verdict 状态 pill。空态不再占位（避免与"未生成"文案重复），骨架态时占位浅灰胶囊。 */}
        {isEmpty ? null : isLoading ? (
          <Skeleton.Button active size="small" style={{ width: 92, height: 28, borderRadius: 999 }} />
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
  const palette = verdictColor[code];
  const label = verdictBadgeLabel[code];
  return (
    <span
      style={{
        background: palette.bg,
        color: palette.fg,
        fontSize: 13,
        fontWeight: 600,
        padding: '6px 12px',
        borderRadius: radius.chip,
        whiteSpace: 'nowrap',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: palette.fg,
          display: 'inline-block',
        }}
      />
      {label}
    </span>
  );
}
