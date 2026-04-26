// 全站设计令牌（Design Tokens）。
// 所有卡片、布局、TopBar / InputBar 都从这里读颜色、圆角、阴影、间距，
// 便于后续整体换皮。AntD 的 ConfigProvider 也在 main.tsx 里映射到这套色板。

/** 中性 / 品牌 / 标签底色，整体走"米白 + 墨绿点缀"的漫游主题。 */
export const colors = {
  /** 全局米白背景 */
  bg: '#FAFAF7',
  /** 卡片底色 */
  surface: '#FFFFFF',
  /** 次级底色（Hero 占位、tag 底） */
  surfaceAlt: '#F4F1EA',
  /** 主品牌墨绿，状态 pill 与 verdict=good 都用它 */
  brand: '#1F8A5B',
  /** 品牌浅底，搭配深绿文字做胶囊标签 */
  brandSoft: '#E6F4EC',
  /** 主要文字 */
  ink: '#1A1A1A',
  /** 次要文字 / 元信息小字 */
  inkMuted: '#6B6B6B',
  /** 辅助提示文字（更弱） */
  inkSubtle: '#9A968B',
  /** 描边、分隔线 */
  stroke: '#E6E3DB',
  /** 谨慎出行（caution）配色 */
  caution: '#B5701F',
  cautionSoft: '#F8ECD4',
  /** 不建议出行（avoid）配色 */
  avoid: '#9A2A2A',
  avoidSoft: '#F4D9D9',
  /** 用户气泡底色 */
  userBubble: '#1A1A1A',
} as const;

/** 能力面板（WelcomeCard）的"软底 + 深色文字"配对。仅供首屏欢迎卡使用。 */
export const tagPalette = {
  pink: { bg: '#F7D6CC', fg: '#8A3B2A' },
  blue: { bg: '#CFE2EC', fg: '#295A73' },
  sand: { bg: '#D9CDB6', fg: '#4A3A1F' },
} as const;

/**
 * 景点列表中所有分类 tag 统一使用一套淡紫配色。
 * 设计令牌侧不再按 category 分色——避免高德返回非预期分类（譬如"购物服务"）时落到灰色不一致；
 * 也避免视觉上多色 tag 与卡片整体的素雅米白调冲突。
 */
export const attractionTag = {
  bg: '#BEADE0',
  fg: '#3D2A6B',
} as const;

/** verdict 枚举：对应 finalizeTripCard 的 hero.verdictBadge 三个取值。 */
export type VerdictCode = 'good' | 'caution' | 'avoid';

/**
 * verdict 颜色色板（仅 bg / fg）：
 * - DestinationHero 右上角的 badge 与 RecommendationPanel 顶部的 pill 共用同一份颜色配色，
 *   保证"地点卡显示什么色 → 总结卡显示什么色"的视觉一致；
 * - 标签文字（"适合出行" / "推荐 · 近期出发" 等）由各组件自行决定，
 *   颜色色板只管颜色——避免一份枚举映射既绑文案又绑色板，后续要改文案得改两处。
 */
export const verdictColor: Record<VerdictCode, { bg: string; fg: string }> = {
  good: { bg: '#E6F4EC', fg: '#1F8A5B' },
  caution: { bg: '#F8ECD4', fg: '#B5701F' },
  avoid: { bg: '#F4D9D9', fg: '#9A2A2A' },
};

/** DestinationHero 右上角 badge 的固定文案：与色板配套使用。 */
export const verdictBadgeLabel: Record<VerdictCode, string> = {
  good: '适合出行',
  caution: '谨慎出行',
  avoid: '不建议出行',
};

/** 圆角 / 阴影 / 字号梯度。 */
export const radius = {
  card: 16,
  panel: 12,
  chip: 999,
} as const;

export const shadow = {
  card: '0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.04)',
} as const;

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

/** 内容主轴宽度。整页布局沿用同一个最大宽度。 */
export const layout = {
  contentMaxWidth: 960,
  topBarHeight: 56,
  inputBarPadBottom: 96,
} as const;
