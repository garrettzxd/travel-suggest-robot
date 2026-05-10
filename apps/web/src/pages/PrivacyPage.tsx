import { Link } from 'react-router-dom';

/** 隐私政策占位页，具体文案待定。 */
export default function PrivacyPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--travel-font-sans)', padding: '48px 24px' }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: '#0f0f0f', marginBottom: 12 }}>隐私政策</h1>
      <p style={{ fontSize: 15, color: '#6b6b6b', marginBottom: 32 }}>内容待定，敬请期待。</p>
      <Link to="/login" style={{ fontSize: 14, color: '#0f0f0f', textDecoration: 'underline' }}>← 返回登录</Link>
    </div>
  );
}
