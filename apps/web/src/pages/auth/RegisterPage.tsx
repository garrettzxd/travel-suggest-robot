import { useState } from 'react';
import { Button, Checkbox, Form, Input, message } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import { postRegister } from '../../api/authApi';

/** 用户图标 */
const UserIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

/** 邮件图标 */
const MailIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);

/** 锁图标 */
const LockIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

import { useAuth } from '../../auth/useAuth';
import AuthLayout from './AuthLayout';
import './RegisterPage.less';

interface RegisterFormValues {
  username: string;
  email: string;
  password: string;
}

/** 计算密码强度：0=弱 1=一般 2=强 3=很强 */
function calcStrength(pw: string): 0 | 1 | 2 | 3 {
  if (pw.length < 8) return 0;
  const types = [/[a-zA-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((r) => r.test(pw)).length;
  if (types === 1) return 1;
  if (types === 2) return 2;
  return 3;
}

const STRENGTH_LABELS = ['弱', '一般', '强', '很强'];

/** 密码强度指示条组件。 */
function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const s = calcStrength(password);
  return (
    <div className="password-strength">
      <div className="strength-bars">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`bar ${i <= s ? `filled-${s}` : ''}`} />
        ))}
      </div>
      <span className={`strength-label s${s}`}>密码强度：{STRENGTH_LABELS[s]}</span>
    </div>
  );
}

/** PC 注册页：昵称、邮箱、密码 + 强度条 + 服务条款确认。 */
export default function RegisterPage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const [loading, setLoading] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [password, setPassword] = useState('');
  const [form] = Form.useForm<RegisterFormValues>();

  /** 注册表单提交。 */
  const handleSubmit = async (values: RegisterFormValues) => {
    if (!agreed) {
      message.warning('请先阅读并同意用户协议与隐私政策');
      return;
    }
    setLoading(true);
    try {
      const user = await postRegister(values);
      auth.login(user);
      navigate('/', { replace: true });
    } catch (err) {
      message.error(err instanceof Error ? err.message : '注册失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout variant="register">
      <div className="register-page">
        <div className="register-mobile-hero">
          <div className="hero-pattern">
            <span>HERO · 旅途风景</span>
          </div>
          <div className="hero-copy">
            <div className="hero-kicker">START · 你的第一段旅程</div>
            <div className="hero-title">把城市名，变成出发的勇气</div>
            <div className="hero-sub">天气、景点、行程，三步给到你。</div>
          </div>
        </div>

        <div className="register-header">
          <span className="step-label">CREATE · ACCOUNT</span>
          <span className="step-progress">STEP 1 / 1</span>
        </div>
        <h1 className="register-heading">创建账号，开启第一段旅程。</h1>
        <p className="register-sub">填写以下信息，创建你的漫游账号。</p>

        <Form
          form={form}
          className="register-form"
          onFinish={handleSubmit}
          validateTrigger="onBlur"
        >
          <div className="register-mobile-form-title">
            <span>创建账号</span>
            <span>STEP · 1 / 1</span>
          </div>

          <div className="form-label">昵称</div>
          <Form.Item
            name="username"
            rules={[{ required: true, message: '请输入昵称' }]}
          >
            <Input
              prefix={<UserIcon />}
              placeholder="如何称呼你？"
              autoComplete="nickname"
              size="large"
            />
          </Form.Item>

          <div className="form-label">邮箱</div>
          <Form.Item
            name="email"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '请输入有效的邮箱地址' },
            ]}
          >
            <Input
              prefix={<MailIcon />}
              placeholder="you@example.com"
              autoComplete="email"
              size="large"
            />
          </Form.Item>

          <div className="form-label">设置密码</div>
          <Form.Item
            name="password"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 8, message: '密码至少 8 位' },
            ]}
          >
            <Input.Password
              prefix={<LockIcon />}
              placeholder="至少 8 位，包含字母与数字"
              autoComplete="new-password"
              size="large"
              onChange={(e) => setPassword(e.target.value)}
            />
          </Form.Item>

          <PasswordStrength password={password} />

          <div className="register-terms">
            <Checkbox checked={agreed} onChange={(e) => setAgreed(e.target.checked)}>
              我已阅读并同意{' '}
              <Link to="/terms" target="_blank">《用户协议》</Link>
              {' '}与{' '}
              <Link to="/privacy" target="_blank">《隐私政策》</Link>
            </Checkbox>
          </div>

          <Form.Item noStyle>
            <Button
              type="primary"
              htmlType="submit"
              className="register-submit-btn"
              loading={loading}
              disabled={!agreed}
              size="large"
            >
              创建账号并出发 →
            </Button>
          </Form.Item>
        </Form>

        <div className="register-mobile-features">
          <div className="feature scenic">
            <span>景点</span>
            <em>AI 精选</em>
          </div>
          <div className="feature weather">
            <span>天气</span>
            <em>实时 7 日</em>
          </div>
          <div className="feature itinerary">
            <span>行程</span>
            <em>一键规划</em>
          </div>
        </div>

        <div className="register-login-row">
          已有账号？
          <span onClick={() => navigate('/login')}>直接登录</span>
        </div>

        <div className="register-mobile-footer">MANYOU · TRAVEL · AI · v1.0</div>
      </div>
    </AuthLayout>
  );
}
