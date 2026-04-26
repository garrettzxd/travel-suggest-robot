import type { CSSProperties, ReactNode } from 'react';
import { colors, radius, shadow, spacing } from '../../theme/tokens';

/** CardContainer Props */
export interface CardContainerProps {
  /** 卡片内容 */
  children: ReactNode;
  /** 覆盖默认白底，用于次级面板（如 WelcomeCard 的能力面板）。 */
  backgroundColor?: string;
  /** 是否显示描边，次级面板/能力面板可以关掉。 */
  bordered?: boolean;
  /** 是否启用 shadow，仅最外层主卡需要。 */
  elevated?: boolean;
  /** 内边距覆写；不传时按默认 padding=24。 */
  padding?: number | string;
  /** 透传 className 供布局微调。 */
  className?: string;
  /** 透传 style 供布局微调（不能覆盖统一的边框 / 阴影规范）。 */
  style?: CSSProperties;
}

/**
 * 所有卡片的基础外壳：统一卡片的圆角、描边、阴影、底色与基础内边距。
 * 业务卡片不重复实现这层外观——CardContainer 是 PRD §7.3.1 中规定的唯一外壳。
 */
export function CardContainer({
  children,
  backgroundColor = colors.surface,
  bordered = true,
  elevated = true,
  padding = spacing.lg,
  className,
  style,
}: CardContainerProps) {
  return (
    <div
      className={className}
      style={{
        background: backgroundColor,
        borderRadius: radius.card,
        border: bordered ? `1px solid ${colors.stroke}` : 'none',
        boxShadow: elevated ? shadow.card : 'none',
        padding,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
