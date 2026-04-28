import type { Itinerary } from '../../../types';
import './ItineraryCard.less';

/** 设计稿中的地图线性图标，用于行程规划卡 header。 */
function MapIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
      className="travel-itinerary__icon"
    >
      <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2V6z" />
      <path d="M9 4v16M15 6v16" />
    </svg>
  );
}

/** ItineraryCard：按设计稿还原，由 SSE `itinerary` 事件驱动。 */
export function ItineraryCard({ title, days, footnote }: Itinerary) {
  const visibleDays = days.filter((day) => day.items.length > 0);

  return (
    <div className="travel-itinerary">
      <div className="travel-itinerary__header">
        <div className="travel-itinerary__title-group">
          <MapIcon />
          <span className="travel-itinerary__title">{title || '行程规划'}</span>
        </div>
        <span className="travel-itinerary__meta">{visibleDays.length} DAYS · ITINERARY</span>
      </div>

      <div className="travel-itinerary__days">
        {visibleDays.map((day, dayIndex) => (
          <div key={`${day.subtitle ?? 'day'}-${dayIndex}`} className="travel-itinerary-day">
            <div className="travel-itinerary-day__head">
              <span className="travel-itinerary-day__label">DAY {dayIndex + 1}</span>
              {day.subtitle && (
                <span className="travel-itinerary-day__subtitle">{day.subtitle}</span>
              )}
              <span className="travel-itinerary-day__line" />
            </div>

            <div className="travel-itinerary-timeline">
              <div className="travel-itinerary-timeline__rail" />
              {day.items.map((item, itemIndex) => (
                <div key={`${item.title}-${itemIndex}`} className="travel-itinerary-item">
                  <div className="travel-itinerary-item__node" />
                  <div className="travel-itinerary-item__content">
                    <div className="travel-itinerary-item__head">
                      {item.time && (
                        <span className="travel-itinerary-item__time">{item.time}</span>
                      )}
                      <span className="travel-itinerary-item__title">{item.title}</span>
                      {item.tag && <span className="travel-itinerary-item__tag">{item.tag}</span>}
                    </div>
                    <div className="travel-itinerary-item__desc">{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {footnote && (
        <div className="travel-itinerary__footnote">
          <b>提示：</b>
          {footnote}
        </div>
      )}
    </div>
  );
}
