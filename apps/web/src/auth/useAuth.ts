import { useContext } from 'react';
import { AuthContext } from './AuthContext';
import type { AuthContextValue } from './AuthContext';

/** 消费全局认证上下文的快捷 hook，组件需在 AuthProvider 内部使用。 */
export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
