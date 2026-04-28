import { CardContainer } from '../CardContainer';
import './WelcomeCard.less';

type CapabilityTone = 'pink' | 'blue' | 'sand';

/** 单个能力面板的视觉描述。 */
interface CapabilityItem {
  /** 标题，如 "景点推荐" */
  title: string;
  /** 副标，弱化文字 */
  subtitle: string;
  /** 圆形图标内的 emoji / 字符（轻量，避免引入图标库） */
  icon: string;
  /** tag 软色板 key */
  tone: CapabilityTone;
}

/** 三块固定能力面板，文案与配色按 PRD §5.2 / §7.3.2 锁定。 */
const CAPABILITIES: CapabilityItem[] = [
  { title: '景点推荐', subtitle: '值得打卡的去处', icon: '⌖', tone: 'pink' },
  { title: '天气查询', subtitle: '实时 + 7 日预报', icon: '☁', tone: 'blue' },
  { title: '出行建议', subtitle: '季节与当季贴士', icon: '✦', tone: 'sand' },
];

/** 渲染单个能力面板。 */
function CapabilityPanel({ item }: { item: CapabilityItem }) {
  return (
    <CardContainer
      tone={item.tone}
      bordered={false}
      elevated={false}
      padding="md"
      className={`travel-welcome-capability is-${item.tone}`}
    >
      <div className="travel-welcome-capability__inner">
        <div className="travel-welcome-capability__icon">{item.icon}</div>
        <div className="travel-welcome-capability__copy">
          <div className="travel-welcome-capability__title">{item.title}</div>
          <div className="travel-welcome-capability__subtitle">{item.subtitle}</div>
        </div>
      </div>
    </CardContainer>
  );
}

/** WelcomeCard 顶部的"漫游助手"头像 + 标题 + 时间戳信息行。 */
function WelcomeHeader({ time }: { time: string }) {
  return (
    <div className="travel-welcome-header">
      <div className="travel-welcome-header__avatar">漫</div>
      <span className="travel-welcome-header__name">漫游助手</span>
      <span className="travel-welcome-header__time">{time}</span>
    </div>
  );
}

/** WelcomeCard Props */
export interface WelcomeCardProps {
  /** 显示在头部的时间戳，默认按当前时间格式化为 HH:MM。 */
  time?: string;
  /** 引导语下方"快捷示例"按钮列表；不提供则不渲染。点击触发 onSuggestionClick。 */
  suggestions?: string[];
  /** 点击建议项的回调；当前能力面板本身不触发请求，仅 suggestions 触发。 */
  onSuggestionClick?: (text: string) => void;
}

/** 当前时间 HH:MM 格式化，仅用于 WelcomeCard 头部展示。 */
function formatNowHHMM(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

/** 新会话默认欢迎卡片。 */
export function WelcomeCard({
  time = formatNowHHMM(),
  suggestions,
  onSuggestionClick,
}: WelcomeCardProps) {
  return (
    <CardContainer>
      <WelcomeHeader time={time} />

      <p className="travel-welcome__intro">
        你好，欢迎踏上新的旅程。我是 <strong>漫游</strong>
        ——你的行程规划伙伴，擅长把一个城市名字变成一份可执行的出行建议。
      </p>

      <div className="travel-welcome__capabilities">
        {CAPABILITIES.map((item) => (
          <CapabilityPanel key={item.title} item={item} />
        ))}
      </div>

      <div className="travel-welcome__hint">告诉我想去的城市或地区，或试试下方的建议 ↓</div>

      {suggestions && suggestions.length > 0 ? (
        <div className="travel-welcome__suggestions">
          {suggestions.map((text) => (
            <button
              key={text}
              type="button"
              onClick={() => onSuggestionClick?.(text)}
              className="travel-welcome__suggestion"
            >
              → {text}
            </button>
          ))}
        </div>
      ) : null}
    </CardContainer>
  );
}
