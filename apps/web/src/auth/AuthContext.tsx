import { createContext, useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AuthUser } from '@travel/shared';
import { getMe, postLogout } from '../api/authApi';
import { onUnauthorized } from '../api/http';

/** 全局认证状态的上下文值。 */
export interface AuthContextValue {
  /** 当前登录用户，null 表示未登录。 */
  user: AuthUser | null;
  /** true 表示正在通过 /api/auth/me 恢复会话，避免未登录闪跳。 */
  loading: boolean;
  /** 登录成功后写入用户信息。 */
  login: (user: AuthUser) => void;
  /** 登出：调用后端 logout 接口，清除本地用户状态。 */
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  login: () => {},
  logout: async () => {},
});

/** 包裹整个应用，负责启动时恢复会话并提供 login / logout 方法。 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMe()
      .then((u) => setUser(u))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    return onUnauthorized(() => {
      setUser(null);
      navigate('/login', { replace: true });
    });
  }, [navigate]);

  const login = useCallback((u: AuthUser) => {
    setUser(u);
  }, []);

  const logout = useCallback(async () => {
    await postLogout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
