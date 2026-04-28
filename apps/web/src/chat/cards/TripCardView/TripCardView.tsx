import { Skeleton } from 'antd';
import { DestinationHero } from '../DestinationHero';
import { WeatherCard } from '../WeatherCard';
import { AttractionList } from '../AttractionList';
import { RecommendationPanel } from '../RecommendationPanel';
import type {
  Attraction,
  ProgressiveTripCard,
  ToolName,
  TripCard,
  WeatherSnapshot,
} from '../../../types';
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
  /** 本轮已经触发过 tool_start 的工具名集合，用于裁剪未涉及的槽位。 */
  toolsStarted?: ToolName[];
  /** 仅 weather-only 场景下使用：把 final 文本回填到 WeatherCard 的"整体评估"，避免 narrative 丢失。 */
  fallbackNarrative?: string;
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
  toolsStarted,
  fallbackNarrative,
}: TripCardViewProps) {
  const heroData = card?.hero ?? progressiveCard?.hero;
  const weatherData = card?.weather ?? progressiveCard?.weather ?? weather;
  // weather-only 时 card_weather 不会到，summary 兜底用 ChatPage 传下来的 final 文本。
  const weatherSummary =
    card?.weather?.summary ?? progressiveCard?.weather?.summary ?? fallbackNarrative;
  const attractionItems = card?.attractions ?? progressiveCard?.attractions ?? attractions;
  const recommendationData = card?.recommendation ?? progressiveCard?.recommendation;
  const chips = card?.chips ?? progressiveCard?.chips;
  const chipsLoading = !chips && !settled;
  const verdict = card?.hero.verdictBadge ?? progressiveCard?.hero?.verdictBadge;

  // cardFlow 表示进入完整 TripCard 流（finalizeTripDestination / finalizeTripAttractionsSummary 至少有一个跑过）。
  // 注意：card_weather 单独到达不算完整流——weather-only 查询也会触发 finalizeTripWeather → card_weather，
  // 此时 progressiveCard 已存在但只有 weather 字段，不能据此展开 Hero / 景点 / 出行建议槽。
  const cardFlow = !!(card || progressiveCard?.hero || progressiveCard?.recommendation);
  const startedWeather = toolsStarted?.includes('getWeather') ?? false;
  const startedAttractions = toolsStarted?.includes('getAttractions') ?? false;

  // 仅在数据将要 / 已经到达的槽位渲染骨架或内容；其它槽位整段跳过。
  const showHero = !!heroData || cardFlow;
  const showWeather = !!weatherData || startedWeather || cardFlow;
  const showAttractions = !!attractionItems || startedAttractions || cardFlow;
  const showRecommendation = !!recommendationData || cardFlow;
  const showChips = !!chips || cardFlow;

  return (
    <div className="travel-trip-card">
      {showHero && <DestinationHero data={heroData} loading={!heroData} settled={settled} />}
      {showWeather && (
        <WeatherCard
          data={weatherData}
          summary={weatherSummary}
          loading={!weatherData}
          settled={settled}
        />
      )}
      {showAttractions && (
        <AttractionList items={attractionItems} loading={!attractionItems} settled={settled} />
      )}
      {showRecommendation && (
        <RecommendationPanel
          data={recommendationData}
          verdict={verdict}
          loading={!recommendationData}
          settled={settled}
        />
      )}
      {showChips && <ChipsBar chips={chips} onChipClick={onChipClick} loading={chipsLoading} />}
    </div>
  );
}
