// TS 侧仅保留运行时需要的设计信息。
// 具体视觉 token 已迁移到 apps/web/src/theme/tokens.less，由 Less/CSS 变量消费。

/** verdict 枚举：对应 finalizeTripCard 的 hero.verdictBadge 三个取值。 */
export type VerdictCode = 'good' | 'caution' | 'avoid';

/** DestinationHero 右上角 badge 的固定文案：与色板配套使用。 */
export const verdictBadgeLabel: Record<VerdictCode, string> = {
  good: '适合出行',
  caution: '谨慎出行',
  avoid: '不建议出行',
};

/** AntD ConfigProvider 仍需要运行时 seed token，不能直接读取 CSS 变量。 */
export const antdThemeToken = {
  colorPrimary: '#1F8A5B',
  colorBgLayout: '#FAFAF7',
  colorTextBase: '#1A1A1A',
  colorBorderSecondary: '#E6E3DB',
  borderRadius: 12,
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', 'Segoe UI', Roboto, sans-serif",
} as const;
