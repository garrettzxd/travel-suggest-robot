import type { CSSProperties } from 'react';
import { Skeleton } from 'antd';
import { CardContainer } from '../CardContainer';
import type { WeatherSnapshot } from '../../../types';
import './WeatherCard.less';

type WeatherGridStyle = CSSProperties & { '--weather-days'?: number };

/** WeatherCard Props（裸数据来自 getWeather，summary 来自 TripCard narrative）。 */
export interface WeatherCardProps {
  /** WeatherSnapshot 裸数据；缺失时整张卡进入骨架态。 */
  data?: WeatherSnapshot;
  /** "整体评估"文案，由 narrative 提供；缺失时显示一行 loading。 */
  summary?: string;
  /** 显式控制骨架；不传时由 !data 决定。 */
  loading?: boolean;
  /** settled=true 且 data 仍缺失时，切到"天气暂不可用"空态。 */
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
function WeatherIcon({ code, size = 'sm' }: { code?: string; size?: 'sm' | 'lg' }) {
  return <i className={`qi qi-${code || '999'} travel-weather-icon travel-weather-icon--${size}`} aria-hidden />;
}

/** 渲染当前天气信息块（左侧大温度 + 图标，右侧三项 meta）。 */
function CurrentWeatherBlock({ data }: { data: WeatherSnapshot }) {
  const meta = [
    { icon: '💧', value: `${data.current.humidityPct}%` },
    { icon: '🍃', value: `${data.current.windDir} ${data.current.windScale} 级` },
    { icon: '👁', value: `${data.current.visibilityKm} km` },
  ];
  return (
    <div className="travel-weather-current">
      <div className="travel-weather-current__main">
        <WeatherIcon code={data.current.iconCode} size="lg" />
        <div className="travel-weather-current__temp">
          <span className="travel-weather-current__temp-value">{Math.round(data.current.tempC)}</span>
          <span className="travel-weather-current__temp-unit">°C</span>
        </div>
        <span className="travel-weather-current__condition">当前 · {data.current.condition}</span>
      </div>
      <div className="travel-weather-current__meta">
        {meta.map((item) => (
          <span key={item.icon} className="travel-weather-current__meta-item">
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
  const gridStyle: WeatherGridStyle = { '--weather-days': daily.length };

  return (
    <div>
      <div className="travel-weather-forecast-label">未来 7 日 · FORECAST</div>
      <div className="travel-weather-forecast-grid" style={gridStyle}>
        {daily.map((d) => (
          <div key={d.date} className="travel-weather-day">
            <span className="travel-weather-day__weekday">
              {formatWeekdayLabel(new Date(d.date), todayStart)}
            </span>
            <span className="travel-weather-day__date">{formatMD(d.date)}</span>
            <WeatherIcon code={d.iconCode} />
            <span className="travel-weather-day__temp">
              {Math.round(d.tMaxC)}°{' '}
              <span className="travel-weather-day__temp-min">{Math.round(d.tMinC)}°</span>
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
    <div className="travel-weather-summary">
      <strong className="travel-weather-summary__label">整体评估：</strong>
      {summary ? (
        summary
      ) : (
        <Skeleton.Input active size="small" className="travel-weather-summary__skeleton" />
      )}
    </div>
  );
}

/** 天气骨架态。 */
function WeatherSkeleton() {
  return (
    <div className="travel-weather-skeleton">
      <div className="travel-weather-skeleton__top">
        <Skeleton.Avatar active size={44} />
        <Skeleton.Input active size="large" className="travel-weather-skeleton__temp" />
        <Skeleton.Input active size="small" className="travel-weather-skeleton__condition" />
      </div>
      <div className="travel-weather-skeleton__grid">
        {Array.from({ length: 7 }).map((_, idx) => (
          <Skeleton.Button key={idx} active block className="travel-weather-skeleton__day" />
        ))}
      </div>
      <Skeleton paragraph={{ rows: 1, width: '92%' }} title={false} active />
    </div>
  );
}

/** 天气失败后的静态空态。 */
function WeatherEmptyState() {
  return (
    <div className="travel-weather-empty">
      <span aria-hidden className="travel-weather-empty__icon">🌥️</span>
      <span className="travel-weather-empty__title">天气暂不可用</span>
      <span className="travel-weather-empty__desc">
        天气接口暂时未返回数据，可稍后重试或先看景点和出行建议。
      </span>
    </div>
  );
}

/** 天气卡。 */
export function WeatherCard({ data, summary, loading, settled }: WeatherCardProps) {
  const isLoading = loading ?? !data;
  const isEmpty = isLoading && settled;

  return (
    <CardContainer>
      {isEmpty ? (
        <WeatherEmptyState />
      ) : isLoading || !data ? (
        <WeatherSkeleton />
      ) : (
        <div className="travel-weather-card">
          <CurrentWeatherBlock data={data} />
          <DailyGrid daily={data.daily} />
          <SummaryBox summary={summary} />
        </div>
      )}
    </CardContainer>
  );
}
