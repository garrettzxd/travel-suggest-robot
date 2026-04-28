import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from './App';
import { antdThemeToken } from './theme/tokens';
import './index.less';
// QWeather 图标字体：CSS 暴露 .qi-{code}::before 字符，字体文件由 Vite 通过相对路径打包。
import '../assets/weather-icons/qweather-icons.css';

const root = createRoot(document.getElementById('root')!);

root.render(
  <StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: antdThemeToken,
      }}
    >
      <App />
    </ConfigProvider>
  </StrictMode>,
);
