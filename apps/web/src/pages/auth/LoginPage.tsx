import { useState } from 'react';
import { Button, Checkbox, Form, Input, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { postLogin } from '../../api/authApi';

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
import './LoginPage.less';

interface LoginFormValues {
  email: string;
  password: string;
  remember: boolean;
}

/** PC 登录页：账号 + 密码表单。 */
export default function LoginPage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm<LoginFormValues>();

  /** 账号登录表单提交。 */
  const handleSubmit = async (values: LoginFormValues) => {
    setLoading(true);
    try {
      const user = await postLogin({ email: values.email, password: values.password });
      auth.login(user);
      navigate('/', { replace: true });
    } catch (err) {
      message.error(err instanceof Error ? err.message : '登录失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout variant="login">
      <div className="login-page">
        <div className="login-step-label">SIGN IN · 01</div>
        <h1 className="login-heading">欢迎回来，继续旅程。</h1>
        <p className="login-sub">使用账号登录漫游。</p>

        <Form
          form={form}
          className="login-form"
          onFinish={handleSubmit}
          initialValues={{ remember: true }}
          validateTrigger="onBlur"
        >
          <div className="form-label">邮箱 / 手机号</div>
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

          <div className="form-label">密码</div>
          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              prefix={<LockIcon />}
              placeholder="至少 8 位"
              autoComplete="current-password"
              size="large"
            />
          </Form.Item>

          <div className="login-remember-row">
            <Form.Item name="remember" valuePropName="checked" noStyle>
              <Checkbox>记住我</Checkbox>
            </Form.Item>
            <span
              className="forgot-link"
              onClick={() => message.info('暂不支持找回密码，请联系管理员')}
            >
              忘记密码？
            </span>
          </div>

          <Form.Item noStyle>
            <Button
              type="primary"
              htmlType="submit"
              className="login-submit-btn"
              loading={loading}
              size="large"
            >
              登录 →
            </Button>
          </Form.Item>
        </Form>

        <div className="login-register-row">
          还没有账号？
          <span className="register-link" onClick={() => navigate('/register')}>
            立即注册
          </span>
        </div>
      </div>
    </AuthLayout>
  );
}
