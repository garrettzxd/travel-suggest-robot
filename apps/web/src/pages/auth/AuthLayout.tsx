import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import './AuthLayout.less';

interface FeatureCard {
  label: string;
  sub: string;
  bg: string;
}

const FEATURE_CARDS: FeatureCard[] = [
  { label: '景点', sub: 'AI 精选', bg: '#f7d6cc' },
  { label: '天气', sub: '实时 7 日', bg: '#cfe2ec' },
  { label: '行程', sub: '一键规划', bg: '#d9cdb6' },
];

interface LeftContent {
  label: string;
  heading: string;
  desc: string;
}

const LEFT_CONTENT: Record<'login' | 'register', LeftContent> = {
  login: {
    label: 'WELCOME · BACK',
    heading: '说出一个城市，\n让漫游替你出发。',
    desc: '天气、景点、是否适合出行——一次问，三件事。\n登录后还可同步对话与行程草稿。',
  },
  register: {
    label: 'START · 你的第一段旅程',
    heading: '把城市名，\n变成出发的勇气。',
    desc: '天气、景点、行程，三步给到你。\n无论何时想走，都有一份可执行的清单。',
  },
};

/** 登录 / 注册页共用的左右分栏布局。variant 控制左侧文案与右侧顶栏按钮高亮。 */
export default function AuthLayout({
  variant,
  children,
}: {
  variant: 'login' | 'register';
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const left = LEFT_CONTENT[variant];

  return (
    <div className="auth-layout">
      {/* 左侧黑色面板 */}
      <div className="auth-left">
        <div className="auth-left-logo">
          <div className="logo-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
            </svg>
          </div>
          <div className="logo-text">
            <span className="logo-name">漫游</span>
            <span className="logo-sub">TRAVEL · AI</span>
          </div>
        </div>

        <div className="auth-left-body">
          <div className="auth-left-label">{left.label}</div>
          <div className="auth-left-heading">
            {left.heading.split('\n').map((line, i) => (
              <span key={i}>{line}<br /></span>
            ))}
          </div>
          <div className="auth-left-desc">
            {left.desc.split('\n').map((line, i) => (
              <span key={i}>{line}<br /></span>
            ))}
          </div>
          <div className="auth-left-cards">
            {FEATURE_CARDS.map((c) => (
              <div key={c.label} className="auth-left-card" style={{ background: c.bg }}>
                <div className="card-label">{c.label}</div>
                <div className="card-sub">{c.sub}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="auth-left-footer">
          <span>MANYOU · TRAVEL · AI · 2026</span>
          <span>已陪伴 · 12,840 段旅程</span>
        </div>
      </div>

      {/* 右侧白色面板 */}
      <div className="auth-right">
        <nav className="auth-right-nav">
          <span className="nav-brand">MANYOU · WEB</span>
          <div className="nav-actions">
            <button
              className={`nav-btn ${variant === 'login' ? 'active' : 'ghost'}`}
              onClick={() => navigate('/login')}
            >
              登录
            </button>
            <button
              className={`nav-btn ${variant === 'register' ? 'active' : 'ghost'}`}
              onClick={() => navigate('/register')}
            >
              注册
            </button>
          </div>
        </nav>

        <div className="auth-right-content">{children}</div>

        <footer className="auth-right-footer">
          <span>© 2026 漫游 MANYOU</span>
          <a href="/terms">用户协议</a>
          <a href="/privacy">隐私政策</a>
        </footer>
      </div>
    </div>
  );
}
