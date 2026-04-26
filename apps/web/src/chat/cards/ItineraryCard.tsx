import type { CSSProperties } from 'react';
import type { Itinerary } from '../../types';

const serifFont =
  '"Songti SC", "STSong", "SimSun", "Source Han Serif SC", serif';
const monoFont = '"SF Mono", "JetBrains Mono", Menlo, Consolas, ui-monospace, monospace';

/** 设计稿中的地图线性图标，用于行程规划卡 header。 */
function MapIcon(props: { style?: CSSProperties }) {
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
      {...props}
    >
      <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2V6z" />
      <path d="M9 4v16M15 6v16" />
    </svg>
  );
}

/**
 * ItineraryCard：按设计稿 plans/2026-04-26/Itinerary-planning.html 还原。
 * 单列布局：每个 day 由「[DAY N] 描边 pill + 宋体 subtitle + 横向贯穿分隔线」组成一条头条，
 * 头条下面挂单列时间轴；与 TripCardView 平级，由 SSE `itinerary` 事件驱动。
 */
export function ItineraryCard({ title, days, footnote }: Itinerary) {
  const visibleDays = days.filter((day) => day.items.length > 0);

  return (
    <div
      style={{
        background: 'var(--card)',
        border: '1px solid var(--card-line)',
        borderRadius: 12,
        padding: '16px 18px 18px',
        marginBottom: 14,
        color: 'var(--card-ink)',
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 14,
          paddingBottom: 12,
          borderBottom: '1px solid var(--card-line-soft)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <MapIcon style={{ flex: '0 0 auto' }} />
          <span
            style={{
              minWidth: 0,
              fontFamily: serifFont,
              fontSize: 15,
              fontWeight: 600,
              letterSpacing: '0.01em',
              lineHeight: 1.4,
              overflowWrap: 'anywhere',
            }}
          >
            {title || '行程规划'}
          </span>
        </div>
        <span
          style={{
            flex: '0 0 auto',
            fontFamily: monoFont,
            fontSize: 10.5,
            color: 'var(--card-ink-mute)',
            letterSpacing: 0.8,
            whiteSpace: 'nowrap',
          }}
        >
          {visibleDays.length} DAYS · ITINERARY
        </span>
      </div>

      <div style={{ position: 'relative' }}>
        {visibleDays.map((day, dayIndex) => (
          <div
            key={`${day.subtitle ?? 'day'}-${dayIndex}`}
            style={{ marginBottom: dayIndex === visibleDays.length - 1 ? 0 : 22 }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 10,
                marginBottom: 12,
                minWidth: 0,
              }}
            >
              <span
                style={{
                  fontFamily: monoFont,
                  fontSize: 11,
                  letterSpacing: 1.4,
                  color: 'var(--card-ink)',
                  fontWeight: 700,
                  padding: '3px 8px',
                  border: '1px solid var(--card-line)',
                  borderRadius: 4,
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                DAY {dayIndex + 1}
              </span>
              {day.subtitle && (
                <span
                  style={{
                    fontFamily: serifFont,
                    fontSize: 14,
                    color: 'var(--card-ink)',
                    fontWeight: 600,
                    lineHeight: 1.4,
                    overflowWrap: 'anywhere',
                  }}
                >
                  {day.subtitle}
                </span>
              )}
              <span
                style={{
                  flex: 1,
                  height: 1,
                  background: 'var(--card-line-soft)',
                  alignSelf: 'center',
                  marginLeft: 4,
                }}
              />
            </div>

            <div style={{ position: 'relative', paddingLeft: 4 }}>
              <div
                style={{
                  position: 'absolute',
                  left: 11,
                  top: 6,
                  bottom: 6,
                  width: 1.5,
                  background: 'var(--card-line)',
                }}
              />
              {day.items.map((item, itemIndex) => (
                <div
                  key={`${item.title}-${itemIndex}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '16px minmax(0, 1fr)',
                    gap: 12,
                    alignItems: 'flex-start',
                    marginBottom: itemIndex === day.items.length - 1 ? 0 : 14,
                    position: 'relative',
                  }}
                >
                  <div
                    style={{
                      width: 16,
                      height: 16,
                      marginTop: 2,
                      borderRadius: '50%',
                      background: 'var(--card)',
                      border: '2px solid var(--accent)',
                      zIndex: 1,
                    }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: 8,
                        flexWrap: 'wrap',
                        marginBottom: 3,
                      }}
                    >
                      {item.time && (
                        <span
                          style={{
                            fontFamily: monoFont,
                            fontSize: 11,
                            color: 'var(--card-ink-mute)',
                            letterSpacing: 0.5,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {item.time}
                        </span>
                      )}
                      <span
                        style={{
                          fontWeight: 600,
                          fontSize: 14,
                          color: 'var(--card-ink)',
                          lineHeight: 1.4,
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {item.title}
                      </span>
                      {item.tag && (
                        <span
                          style={{
                            fontSize: 10.5,
                            color: '#ffffff',
                            background: 'var(--accent)',
                            padding: '1px 7px',
                            borderRadius: 3,
                            fontWeight: 600,
                            letterSpacing: 0.2,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {item.tag}
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 12.5,
                        color: 'var(--card-ink-soft)',
                        lineHeight: 1.55,
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {item.desc}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {footnote && (
        <div
          style={{
            marginTop: 14,
            paddingTop: 12,
            borderTop: '1px dashed var(--card-line)',
            fontSize: 12.5,
            color: 'var(--card-ink-soft)',
            lineHeight: 1.6,
            overflowWrap: 'anywhere',
          }}
        >
          <b style={{ color: 'var(--card-ink)' }}>提示：</b>
          {footnote}
        </div>
      )}
    </div>
  );
}
