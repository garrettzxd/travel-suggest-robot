import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from './App';
import { colors, radius } from './theme/tokens';
import './index.css';
// QWeather 图标字体：CSS 暴露 .qi-{code}::before 字符，字体文件由 Vite 通过相对路径打包。
import '../assets/weather-icons/qweather-icons.css';

const root = createRoot(document.getElementById('root')!);

root.render(
  <StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: colors.brand,
          colorBgLayout: colors.bg,
          colorTextBase: colors.ink,
          colorBorderSecondary: colors.stroke,
          borderRadius: 12,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', 'Segoe UI', Roboto, sans-serif",
        },
      }}
    >
      <App />
    </ConfigProvider>
  </StrictMode>,
);
