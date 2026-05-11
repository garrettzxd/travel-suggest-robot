import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import ProtectedRoute from './router/ProtectedRoute';
import ChatPage from './chat/ChatPage';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import TermsPage from './pages/TermsPage';
import PrivacyPage from './pages/PrivacyPage';

const routerBasename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';

/** 应用根组件：装配认证上下文、路由树与受保护路由守卫。 */
export default function App() {
  return (
    <BrowserRouter basename={routerBasename}>
      <AuthProvider>
        <Routes>
          {/* 公开路由 */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          {/* 受保护路由 */}
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<ChatPage />} />
          </Route>
          {/* 404 兜底 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
