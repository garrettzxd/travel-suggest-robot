import { Skeleton } from 'antd';
import { CardContainer } from './CardContainer';
import type { WeatherSnapshot } from '../../types';
import { colors, radius, spacing } from '../../theme/tokens';

/** WeatherCard Props（裸数据来自 getWeather，summary 来自 finalizeTripCard）。 */
export interface WeatherCardProps {
  /** WeatherSnapshot 裸数据；缺失时整张卡进入骨架态。 */
  data?: WeatherSnapshot;
  /** "整体评估"文案，由 finalizeTripCard narrative 提供；缺失时显示一行 loading。 */
  summary?: string;
  /** 显式控制骨架；不传时由 !data 决定。 */
  loading?: boolean;
  /**
   * 本轮回复是否已完结。settled=true 且 data 仍缺失时，切到"天气暂不可用"空态——
   * 这是 getWeather 工具失败的兜底视觉，避免 WeatherCard 永远转骨架。
   */
  settled?: boolean;
}

/** 中文星期短码：今天 / 明天 单独标注，其余按 `Intl.DateTimeFormat` weekday=narrow 取。 */
function formatWeekdayLabel(date: Date, todayStart: number): string {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  const diffDays = Math.round((day.getTime() - todayStart) / 86400000);
  if (diffDays === 0) return '今';
  if (diffDays === 1) return '明';
  return new Intl.DateTimeFormat('zh-CN', { weekday: 'narrow' }).format(date);
}

/** 把 ISO 日期串裁成 M/D，与设计稿一致。 */
function formatMD(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** QWeather icon 渲染：传入 iconCode（字符串），无则降级 999。 */
function WeatherIcon({ code, size }: { code?: string; size: number }) {
  return (
    <i
      className={`qi qi-${code || '999'}`}
      style={{ fontSize: size, color: colors.ink, lineHeight: 1 }}
      aria-hidden
    />
  );
}

/** 渲染当前天气信息块（左侧大温度 + 图标，右侧三项 meta）。 */
function CurrentWeatherBlock({ data }: { data: WeatherSnapshot }) {
  const meta = [
    { icon: '💧', value: `${data.current.humidityPct}%` },
    { icon: '🍃', value: `${data.current.windDir} ${data.current.windScale} 级` },
    { icon: '👁', value: `${data.current.visibilityKm} km` },
  ];
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
        <WeatherIcon code={data.current.iconCode} size={44} />
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 32, fontWeight: 700, color: colors.ink, lineHeight: 1 }}>
            {Math.round(data.current.tempC)}
          </span>
          <span style={{ fontSize: 14, color: colors.inkMuted }}>°C</span>
        </div>
        <span style={{ fontSize: 13, color: colors.inkMuted }}>
          当前 · {data.current.condition}
        </span>
      </div>
      <div style={{ display: 'flex', gap: spacing.md, color: colors.inkMuted, fontSize: 13 }}>
        {meta.map((item) => (
          <span key={item.icon} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span aria-hidden>{item.icon}</span>
            {item.value}
          </span>
        ))}
      </div>
    </div>
  );
}

/** 7 日预报横向等宽网格，单列：星期 + M/D + icon + tMax / tMin。 */
function DailyGrid({ daily }: { daily: WeatherSnapshot['daily'] }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = today.getTime();

  return (
    <div>
      <div
        style={{
          fontSize: 11,
          letterSpacing: '0.12em',
          color: colors.inkMuted,
          marginBottom: spacing.sm,
          textTransform: 'uppercase',
        }}
      >
        未来 7 日 · FORECAST
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${daily.length}, minmax(0, 1fr))`,
          gap: spacing.xs,
        }}
      >
        {daily.map((d) => (
          <div
            key={d.date}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
              padding: '8px 4px',
              borderRadius: radius.panel,
            }}
          >
            <span style={{ fontSize: 12, color: colors.inkMuted }}>
              {formatWeekdayLabel(new Date(d.date), todayStart)}
            </span>
            <span style={{ fontSize: 11, color: colors.inkSubtle }}>{formatMD(d.date)}</span>
            <WeatherIcon code={d.iconCode} size={20} />
            <span style={{ fontSize: 13, color: colors.ink, fontWeight: 600 }}>
              {Math.round(d.tMaxC)}° <span style={{ color: colors.inkMuted, fontWeight: 400 }}>{Math.round(d.tMinC)}°</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 底部"整体评估"灰底块：summary 已到则显示文本；未到显示一行 loading。 */
function SummaryBox({ summary }: { summary?: string }) {
  return (
    <div
      style={{
        background: colors.surfaceAlt,
        borderRadius: radius.panel,
        padding: `${spacing.sm}px ${spacing.md}px`,
        fontSize: 13,
        color: colors.ink,
        lineHeight: 1.6,
      }}
    >
      <strong style={{ marginRight: spacing.xs }}>整体评估：</strong>
      {summary ? (
        summary
      ) : (
        <Skeleton paragraph={{ rows: 1, width: '85%' }} title={false} active />
      )}
    </div>
  );
}

/** 整张 WeatherCard 的骨架态：现场块 + 7 列方块 + 一行 loading。 */
function WeatherSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
      <div style={{ display: 'flex', gap: spacing.md, alignItems: 'center' }}>
        <Skeleton.Avatar active size={44} shape="circle" />
        <Skeleton paragraph={{ rows: 2, width: ['60%', '40%'] }} title={false} active />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: spacing.xs }}>
        {Array.from({ length: 7 }).map((_, idx) => (
          <Skeleton.Button key={idx} active block style={{ height: 76 }} />
        ))}
      </div>
      <Skeleton paragraph={{ rows: 1, width: '90%' }} title={false} active />
    </div>
  );
}

/** 天气暂不可用的静态空态：本轮已结束但仍未拿到天气裸数据（getWeather 工具失败）。 */
function WeatherUnavailable() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.xs,
        padding: `${spacing.md}px 0`,
        color: colors.inkMuted,
      }}
    >
      <span aria-hidden style={{ fontSize: 24 }}>🌥️</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: colors.ink }}>天气暂不可用</span>
      <span style={{ fontSize: 12, color: colors.inkSubtle, textAlign: 'center' }}>
        天气接口暂时未返回数据，可稍后重试或先看景点和出行建议。
      </span>
    </div>
  );
}

/**
 * 天气卡。三段渐进：骨架 → 裸数据（summary 仍 loading） → summary 填入。
 * data 为空时整张卡都骨架；data 到达后即可展示完整气象信息，summary 单独 loading；
 * settled+无数据时切"天气暂不可用"静态空态。
 */
export function WeatherCard({ data, summary, loading, settled }: WeatherCardProps) {
  const isLoading = loading ?? !data;
  const isEmpty = isLoading && settled;

  return (
    <CardContainer>
      {isEmpty ? (
        <WeatherUnavailable />
      ) : isLoading || !data ? (
        <WeatherSkeleton />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
          <CurrentWeatherBlock data={data} />
          <DailyGrid daily={data.daily} />
          <SummaryBox summary={summary} />
        </div>
      )}
    </CardContainer>
  );
}
