# 前端样式 Less 化与组件目录重组方案

## 一、需求背景

当前聊天前端组件集中放在 `apps/web/src/chat` 与 `apps/web/src/chat/cards` 下，组件文件中存在较多内联 `style`，并直接依赖 `apps/web/src/theme/tokens.ts` 中的 `colors`、`spacing`、`radius`、`layout`、`shadow` 等 TS 常量。随着 TripCard、ItineraryCard、渐进式骨架态和错误态不断增加，这种组织方式带来几个问题：

- 组件逻辑和视觉样式混在同一个 TSX 文件里，阅读成本高；
- 大量样式对象散落在组件内部，后续做主题化、响应式和视觉回归排查时定位困难；
- 所有卡片组件平铺在 `cards/` 目录下，新增 Less 文件后如果继续平铺，会让组件和样式文件混在同一层，边界不清；
- 视觉 token 作为 TS 对象被组件直接消费，不利于 Less / CSS 变量统一承接，也不方便覆盖主题。

本次目标是把聊天前端调整为“每个组件一个目录，组件与 Less 样式同目录”，同时把视觉 token 下沉为 CSS 变量，由 Less 统一消费。TS 侧只保留运行时确实需要的类型和 Ant Design theme seed。

## 二、目标目录结构

迁移后的组件目录按组件边界组织：

```text
apps/web/src/chat/
  ChatPage/
    ChatPage.tsx
    ChatPage.less
    index.ts
  TopBar/
    TopBar.tsx
    TopBar.less
    index.ts
  InputBar/
    InputBar.tsx
    InputBar.less
    index.ts
  cards/
    CardContainer/
      CardContainer.tsx
      CardContainer.less
      index.ts
    DestinationHero/
      DestinationHero.tsx
      DestinationHero.less
      index.ts
    WeatherCard/
      WeatherCard.tsx
      WeatherCard.less
      index.ts
    AttractionList/
      AttractionList.tsx
      AttractionList.less
      index.ts
    RecommendationPanel/
      RecommendationPanel.tsx
      RecommendationPanel.less
      index.ts
    TripCardView/
      TripCardView.tsx
      TripCardView.less
      index.ts
    WelcomeCard/
      WelcomeCard.tsx
      WelcomeCard.less
      index.ts
    ItineraryCard/
      ItineraryCard.tsx
      ItineraryCard.less
      index.ts
  useTravelAgent.ts
```

组件 import 统一走目录入口，例如：

```ts
import { TopBar } from './TopBar';
import { WeatherCard } from './cards/WeatherCard';
```

每个 `index.ts` 只做组件导出和 props 类型导出：

```ts
export { WeatherCard } from './WeatherCard';
export type { WeatherCardProps } from './WeatherCard';
```

## 三、样式技术方案

### 3.1 Less 与全局 token

新增 `apps/web/src/theme/tokens.less`，定义全局 CSS 变量：

- 色彩：`--travel-color-bg`、`--travel-color-surface`、`--travel-color-brand`、`--travel-color-text`、`--travel-color-muted` 等；
- 间距：`--travel-space-xs`、`--travel-space-sm`、`--travel-space-md`、`--travel-space-lg`、`--travel-space-xl`；
- 圆角：`--travel-radius-card`、`--travel-radius-panel`、`--travel-radius-chip`；
- 布局：`--travel-layout-content-max-width`、`--travel-layout-topbar-height`、`--travel-layout-input-pad-bottom`；
- 卡片兼容变量：保留 `--card`、`--card-line`、`--card-ink`、`--accent`、`--accent-hl` 等，供 TripCard / ItineraryCard 继续使用。

入口样式由 `apps/web/src/index.css` 迁移为 `apps/web/src/index.less`，并在文件顶部引入 token：

```less
@import './theme/tokens.less';
```

`index.less` 继续承接全局 reset、`body`、`#root`、`.placeholder-stripe` 和通用动画。

### 3.2 tokens.ts 收敛

`apps/web/src/theme/tokens.ts` 不再作为组件样式来源，仅保留：

- `VerdictCode`；
- `verdictBadgeLabel`；
- Ant Design `ConfigProvider` 需要的 `antdThemeToken` seed。

组件不再 import `colors` / `spacing` / `radius` / `layout` / `shadow`，统一使用 className + Less 中的 CSS 变量。

### 3.3 组件样式约定

- 使用普通 Less 全局 class，不启用 CSS Modules；
- class 命名使用 `travel-` 前缀，按组件职责收口；
- 不再把整块布局写成 `style={{ ... }}`；
- 真正由运行时数据决定、且不适合枚举 class 的值，通过 CSS 变量注入。

保留的动态样式例外：

```ts
style={{ '--hero-image': `url(${heroImageUrl})` }}
style={{ '--attraction-image': `url(${imageUrl})` }}
style={{ '--weather-days': forecast.length }}
```

这些值只负责把运行时数据传给 CSS，不承载布局规则。

### 3.4 CardContainer API

通用容器从“任意样式透传”收敛为语义 props：

```ts
export interface CardContainerProps {
  children: React.ReactNode;
  className?: string;
  tone?: 'default' | 'pink' | 'blue' | 'sand';
  bordered?: boolean;
  elevated?: boolean;
  padding?: 'none' | 'md' | 'lg';
}
```

调用方通过 `tone`、`bordered`、`elevated`、`padding` 表达视觉差异，具体色彩、阴影、圆角、边距均在 `CardContainer.less` 中维护。

## 四、Frontend 改动清单

| 类型 | 路径 | 动作 |
|---|---|---|
| 依赖 | `apps/web/package.json` | 新增 `less` devDependency |
| 锁文件 | `pnpm-lock.yaml` | 同步 Less 依赖解析 |
| 样式入口 | `apps/web/src/index.css` | 删除，迁移为 Less |
| 样式入口 | `apps/web/src/index.less` | 新增全局入口样式并 import token |
| token | `apps/web/src/theme/tokens.less` | 新增 CSS 变量定义 |
| token | `apps/web/src/theme/tokens.ts` | 收敛为运行时类型与 AntD theme seed |
| 入口 | `apps/web/src/main.tsx` | 引入 `index.less`，使用 `antdThemeToken` |
| 页面组件 | `apps/web/src/chat/ChatPage/` | 新建目录，迁移 TSX / Less / index |
| 顶栏组件 | `apps/web/src/chat/TopBar/` | 新建目录，迁移 TSX / Less / index |
| 输入组件 | `apps/web/src/chat/InputBar/` | 新建目录，迁移 TSX / Less / index |
| 卡片容器 | `apps/web/src/chat/cards/CardContainer/` | 新建目录，抽离 Less 并收敛 props |
| 地点 Hero | `apps/web/src/chat/cards/DestinationHero/` | 新建目录，抽离 Less |
| 天气卡片 | `apps/web/src/chat/cards/WeatherCard/` | 新建目录，抽离 Less |
| 景点列表 | `apps/web/src/chat/cards/AttractionList/` | 新建目录，抽离 Less |
| 推荐面板 | `apps/web/src/chat/cards/RecommendationPanel/` | 新建目录，抽离 Less |
| TripCard 组合 | `apps/web/src/chat/cards/TripCardView/` | 新建目录，抽离 Less |
| 欢迎卡片 | `apps/web/src/chat/cards/WelcomeCard/` | 新建目录，抽离 Less |
| 行程卡片 | `apps/web/src/chat/cards/ItineraryCard/` | 新建目录，抽离 Less |

迁移后删除原平铺文件：

- `apps/web/src/chat/ChatPage.tsx`
- `apps/web/src/chat/TopBar.tsx`
- `apps/web/src/chat/InputBar.tsx`
- `apps/web/src/chat/cards/*.tsx`

## 五、实施顺序

1. 安装 Less 支持，只作用于 `@travel/web`。
2. 新增 `tokens.less` 与 `index.less`，切换 `main.tsx` 的入口样式引用。
3. 将页面级组件迁移为独立目录：`ChatPage`、`TopBar`、`InputBar`。
4. 将卡片组件按组件名迁移为独立目录。
5. 逐组件抽离内联样式到对应 Less：
   - 先迁移外层布局与通用容器；
   - 再迁移 TripCard 子卡；
   - 最后迁移 WelcomeCard 与 ItineraryCard。
6. 收敛 `tokens.ts`，移除组件对视觉 TS token 的依赖。
7. 跑类型检查、生产构建和样式清理检查。

## 六、验证方案

### 6.1 自动检查

```bash
pnpm --filter @travel/web exec tsc --noEmit
pnpm --filter @travel/web build
rg -n "style=\\{\\{|colors\\.|spacing\\.|radius\\.|layout\\.|shadow\\." apps/web/src/chat
```

预期：

- TypeScript 检查通过；
- Vite 生产构建通过；
- 样式清理检查无命中；
- `style=` 仅允许少量动态 CSS 变量注入。

### 6.2 视觉回归场景

| 场景 | 检查点 |
|---|---|
| Welcome 首屏 | 顶栏、欢迎卡、能力卡片和输入栏布局不变 |
| 普通 markdown 回复 | 文本气泡、错误气泡样式正常 |
| TripCard 骨架态 | hero、天气、景点、推荐面板 skeleton 不错位 |
| TripCard 渐进态 | 裸天气 / 裸景点 / 局部 narrative 到达后可分批填充 |
| ItineraryCard | DAY rail、时间轴、footnote、窄屏布局正常 |
| 窄屏 | chips、天气网格、景点列表不溢出 |

## 七、已完成落地记录

本次实现已完成以下验证：

```bash
pnpm --filter @travel/web exec tsc --noEmit
pnpm --filter @travel/web build
rg -n "style=\\{\\{|colors\\.|spacing\\.|radius\\.|layout\\.|shadow\\." apps/web/src/chat
```

结果：

- `tsc --noEmit` 通过；
- `pnpm --filter @travel/web build` 通过；
- 样式清理检查无命中；
- Vite 构建存在 chunk 体积提示，属于已有打包优化提醒，不影响本次样式迁移。

开发服务可通过以下地址验证：

```text
http://127.0.0.1:5174/
```

## 八、风险与后续事项

- 本次不改变 SSE、消息状态和业务数据结构，仅调整目录和样式组织；
- Less 使用全局 class，需要继续保持组件名前缀，避免后续样式撞名；
- `antdThemeToken` 仍保留在 TS 中，因为 Ant Design `ConfigProvider` 需要运行时对象；
- 未来如需深度主题切换，可继续把 AntD seed 与 CSS 变量建立统一映射；
- Vite chunk 体积提示可在后续单独通过动态 import 或 `manualChunks` 优化。
