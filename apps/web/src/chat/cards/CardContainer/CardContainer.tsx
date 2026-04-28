import type { ReactNode } from 'react';
import './CardContainer.less';

/** CardContainer Props */
export interface CardContainerProps {
  /** 卡片内容 */
  children: ReactNode;
  /** 色调变体，默认白底。 */
  tone?: 'default' | 'pink' | 'blue' | 'sand';
  /** 是否显示描边，次级面板/能力面板可以关掉。 */
  bordered?: boolean;
  /** 是否启用 shadow，仅最外层主卡需要。 */
  elevated?: boolean;
  /** 内边距规格。 */
  padding?: 'none' | 'md' | 'lg';
  /** 透传 className 供布局微调。 */
  className?: string;
}

/** 所有卡片的基础外壳：统一卡片的圆角、描边、阴影、底色与基础内边距。 */
export function CardContainer({
  children,
  tone = 'default',
  bordered = true,
  elevated = true,
  padding = 'lg',
  className,
}: CardContainerProps) {
  const classes = [
    'travel-card-container',
    `travel-card-container--tone-${tone}`,
    `travel-card-container--pad-${padding}`,
    bordered ? 'is-bordered' : 'is-borderless',
    elevated ? 'is-elevated' : 'is-flat',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return <div className={classes}>{children}</div>;
}
