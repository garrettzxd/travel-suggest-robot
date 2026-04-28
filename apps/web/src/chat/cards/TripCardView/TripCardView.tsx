import { Skeleton } from 'antd';
import { DestinationHero } from '../DestinationHero';
import { WeatherCard } from '../WeatherCard';
import { AttractionList } from '../AttractionList';
import { RecommendationPanel } from '../RecommendationPanel';
import type { Attraction, ProgressiveTripCard, TripCard, WeatherSnapshot } from '../../../types';
import './TripCardView.less';

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
  /** 本轮回复是否已完结（final 或 done 已到达）。 */
  settled?: boolean;
  /** 点击 chip 后的回调，由 ChatPage 转交 onRequest。 */
  onChipClick?: (text: string) => void;
}

/** 卡片下方独立渲染的 chips 行。 */
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
      <div className="travel-trip-card__chips">
        {Array.from({ length: 4 }).map((_, idx) => (
          <Skeleton.Button key={idx} active className="travel-trip-card__chip-skeleton" />
        ))}
      </div>
    );
  }
  if (!chips || chips.length === 0) return null;

  return (
    <div className="travel-trip-card__chips">
      {chips.map((text) => (
        <button
          key={text}
          type="button"
          onClick={() => onChipClick?.(text)}
          className="travel-trip-card__chip"
        >
          → {text}
        </button>
      ))}
    </div>
  );
}

/** 组合器：按 Hero → Weather → Attractions → Recommendation 顺序串四张子卡。 */
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
  const weatherSummary = card?.weather?.summary ?? progressiveCard?.weather?.summary;
  const attractionItems = card?.attractions ?? progressiveCard?.attractions ?? attractions;
  const recommendationData = card?.recommendation ?? progressiveCard?.recommendation;
  const chips = card?.chips ?? progressiveCard?.chips;
  const chipsLoading = !chips && !settled;
  const verdict = card?.hero.verdictBadge ?? progressiveCard?.hero?.verdictBadge;

  return (
    <div className="travel-trip-card">
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
        verdict={verdict}
        loading={!recommendationData}
        settled={settled}
      />
      <ChipsBar chips={chips} onChipClick={onChipClick} loading={chipsLoading} />
    </div>
  );
}
