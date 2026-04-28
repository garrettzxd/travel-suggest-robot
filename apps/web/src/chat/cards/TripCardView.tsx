import { Skeleton } from 'antd';
import { DestinationHero } from './DestinationHero';
import { WeatherCard } from './WeatherCard';
import { AttractionList } from './AttractionList';
import { RecommendationPanel } from './RecommendationPanel';
import type { Attraction, ProgressiveTripCard, TripCard, WeatherSnapshot } from '../../types';
import { colors, radius, spacing } from '../../theme/tokens';

/** TripCardView Props（PRD §7.3.7）。 */
export interface TripCardViewProps {
  /** getWeather 的裸数据。 */
  weather?: WeatherSnapshot;
  /** getAttractions 的裸数据。 */
  attractions?: Attraction[];
  /** finalizeTripCard 合并后的完整 TripCard；narrative 字段优先取自这里。 */
  card?: TripCard;
  /** 渐进式 TripCard 局部事件累积出的数据。 */
  progressiveCard?: ProgressiveTripCard;
  /**
   * 本轮回复是否已完结（final 或 done 已到达）。
   * 用于把"还在等"的骨架切到"等不到了"的静态空态——
   * 例如 hero / recommendation 在没有 card 的情况下，settled 之后展示空态而不是继续骨架动画。
   */
  settled?: boolean;
  /** 点击 chip 后的回调，由 ChatPage 转交 onRequest。 */
  onChipClick?: (text: string) => void;
}

/**
 * 卡片下方独立渲染的 chips 行：不在 CardContainer 里，按"裸按钮"贴合卡组渲染。
 * loading / settled 兜底交给父级——这里只负责渲染样式。
 */
function ChipsBar({
  chips,
  onChipClick,
  loading,
}: {
  chips?: string[];
  onChipClick?: (text: string) => void;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: spacing.xs,
          padding: `0 ${spacing.xxs}px`,
        }}
      >
        {Array.from({ length: 4 }).map((_, idx) => (
          <Skeleton.Button
            key={idx}
            active
            style={{ height: 30, borderRadius: 999, width: 140 }}
          />
        ))}
      </div>
    );
  }
  if (!chips || chips.length === 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: spacing.xs,
        padding: `0 ${spacing.xxs}px`,
      }}
    >
      {chips.map((text) => (
        <button
          key={text}
          type="button"
          onClick={() => onChipClick?.(text)}
          style={{
            border: `1px solid ${colors.stroke}`,
            background: colors.surface,
            color: colors.ink,
            fontSize: 13,
            padding: '6px 14px',
            borderRadius: radius.chip,
            cursor: 'pointer',
            lineHeight: 1.4,
          }}
        >
          → {text}
        </button>
      ))}
    </div>
  );
}

/**
 * 组合器：按 Hero → Weather → Attractions → Recommendation 顺序串四张子卡，
 * 卡组下方独立渲染 chips（不属于任何子卡，按设计稿应"挂在卡片外侧"）。
 *
 * 各子卡 loading 由数据可用性决定，符合 PRD §7.4 的三段式渐进时序：
 * - card 没到时 hero / recommendation / chips 全部骨架；
 * - weather / attractions 各自从 tool_end 拿到裸数据后立即升级；
 * - card 到达后 narrative 字段补齐到对应子卡（已渲染裸数据保持不变避免闪烁）；
 * - settled=true 后仍缺数据则切静态空态，停止骨架动画（PRD §7.4 兜底要求）。
 */
export function TripCardView({
  weather,
  attractions,
  card,
  progressiveCard,
  settled,
  onChipClick,
}: TripCardViewProps) {
  const heroData = card?.hero ?? progressiveCard?.hero;
  const weatherData = card?.weather ?? progressiveCard?.weather ?? weather;
  // card.weather 整段可缺失（getWeather 失败兜底），summary 用可选链即可。
  const weatherSummary = card?.weather?.summary ?? progressiveCard?.weather?.summary;
  const attractionItems = card?.attractions ?? progressiveCard?.attractions ?? attractions;
  const recommendationData = card?.recommendation ?? progressiveCard?.recommendation;
  const chips = card?.chips ?? progressiveCard?.chips;
  // chips 跟 recommendation 同源（card.chips），所以 chips 的 loading/empty 与之联动。
  const chipsLoading = !chips && !settled;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
      <DestinationHero data={heroData} loading={!heroData} settled={settled} />
      <WeatherCard
        data={weatherData}
        summary={weatherSummary}
        loading={!weatherData}
        settled={settled}
      />
      <AttractionList items={attractionItems} loading={!attractionItems} settled={settled} />
      <RecommendationPanel
        data={recommendationData}
        // verdict 直接来自 hero 的 verdictBadge，pill 颜色与 hero 右上角 badge 同步。
        verdict={card?.hero.verdictBadge}
        loading={!recommendationData}
        settled={settled}
      />
      <ChipsBar chips={chips} onChipClick={onChipClick} loading={chipsLoading} />
    </div>
  );
}
