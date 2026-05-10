# PC 登录 / 注册页面 — 前端实现方案

## Context

server 层已完成 SQLite + JWT Cookie 认证体系（见 `plans/2026-05-06/Server 持久化层方案.md`），暴露了 `/api/auth/register`、`/api/auth/login`、`/api/auth/logout`、`/api/auth/me` 四个接口。前端目前没有路由，`App.tsx` 直接渲染 `ChatPage`，没有任何登录态。本计划在 web 应用引入路由 + 认证上下文 + PC 登录 / 注册页，与设计稿完全对齐。

---

## 1. 依赖变更

```bash
# apps/web/package.json 新增
pnpm -F @travel/web add react-router-dom
```

无需额外图标库：左侧面板图标用 SVG inline，输入框图标用 Ant Design 自带。

---

## 2. 新增文件总览

```
apps/web/src/
├── auth/
│   ├── AuthContext.tsx          # 全局 auth state + Provider
│   └── useAuth.ts               # 消费 AuthContext 的 hook
├── api/
│   ├── client.ts                # [改] 加 credentials: 'include'
│   └── authApi.ts               # [新] login / register / logout / me
├── router/
│   ├── index.tsx                # 路由定义
│   └── ProtectedRoute.tsx       # 未登录重定向 /login
└── pages/
    ├── auth/
    │   ├── AuthLayout.tsx        # 左右分栏布局（左黑色面板 + 右表单区）
    │   ├── AuthLayout.less       # 斜纹背景、feature 卡片、左侧排版
    │   ├── LoginPage.tsx         # 登录表单
    │   ├── LoginPage.less        # tab 下划线、密码 icon 等
    │   ├── RegisterPage.tsx      # 注册表单 + 密码强度
    │   └── RegisterPage.less     # 密码强度条样式
    ├── TermsPage.tsx             # 用户协议空页（路由占位）
    └── PrivacyPage.tsx           # 隐私政策空页（路由占位）
```

### 改动的现有文件

| 文件 | 改动 |
|---|---|
| `apps/web/package.json` | 新增 react-router-dom 依赖 |
| `apps/web/src/App.tsx` | 包裹 AuthProvider + RouterProvider |
| `apps/web/src/api/client.ts` | 加 `credentials: 'include'` |

---

## 3. 路由结构

```
/               → ChatPage（ProtectedRoute 守卫）
/login          → LoginPage
/register       → RegisterPage
/terms          → TermsPage
/privacy        → PrivacyPage
*               → redirect → /
```

`ProtectedRoute` 逻辑：
1. 若 `AuthContext.loading === true` → 渲染全屏 `<Spin>` 占位（避免闪烁跳转）
2. 若 `user === null` → `<Navigate to="/login" replace />`
3. 否则 → `<Outlet />`

---

## 4. AuthContext 设计

**文件**：`apps/web/src/auth/AuthContext.tsx`

```ts
interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;          // GET /api/auth/me 请求进行中
  login: (u: AuthUser) => void;
  logout: () => void;
}
```

Provider 在挂载时调用 `GET /api/auth/me`（详见第 5 节）：
- 200 → `setUser(user)`
- 401 或网络错 → `setUser(null)`
- 最终 `setLoading(false)`

---

## 5. Auth API 客户端

**文件**：`apps/web/src/api/authApi.ts`

四个函数，全部携带 `credentials: 'include'` 以传递 httpOnly Cookie：

```ts
getMe()      → GET  /api/auth/me      → AuthUser | null
postLogin()  → POST /api/auth/login   → AuthUser（失败抛 Error，含服务端 message）
postRegister() → POST /api/auth/register → AuthUser
postLogout() → POST /api/auth/logout  → void（204）
```

同步更新 `apps/web/src/api/client.ts` 的 `postChat()`，加 `credentials: 'include'`（server 已要求 auth 中间件）。

---

## 6. AuthLayout — 左右分栏

**文件**：`apps/web/src/pages/auth/AuthLayout.tsx` + `AuthLayout.less`

### 布局结构

```
┌──────────────────────────────────────────────────────┐
│  LeftPanel (44% width, dark)   │  RightPanel (56%)   │
│  • 斜纹背景                    │  • 顶栏 nav         │
│  • Logo + brand                │  • 表单内容(slot)   │
│  • 标语文案                    │  • 底部版权         │
│  • 3 feature cards             │                     │
│  • footer stats                │                     │
└──────────────────────────────────────────────────────┘
```

### LeftPanel 样式

```less
// 深色背景 + 45° 白色细斜线（每 18px 重复）
background: #0f0f0f;
background-image: repeating-linear-gradient(
  135deg,
  rgba(255,255,255,0.035) 0,
  rgba(255,255,255,0.035) 1px,
  transparent 1px,
  transparent 18px
);
```

左侧文案根据 `variant` prop（`'login' | 'register'`）切换：
- login：`WELCOME · BACK` / 说出一个城市，让漫游替你出发。
- register：`START · 你的第一段旅程` / 把城市名，变成出发的勇气。

3 个 feature 卡：`{ label: '景点', sub: 'AI 精选', bg: '#f7d6cc' }` / `天气/实时7日/#cfe2ec` / `行程/一键规划/#d9cdb6`

RightPanel 顶栏：
- 左：`MANYOU · WEB` 品牌文字
- 中：`登录` / `注册` 两个按钮（当前页对应的按钮填充黑色，另一个是文字 link，点击跳转对应路由）
- 右：🌐 简体中文（仅 UI，不接实际 i18n）

RightPanel 底部版权：`© 2026 漫游 MANYOU | 用户协议 | 隐私政策 | 帮助中心`（后两项链接到 /privacy、/terms；帮助中心无链接，仅文字）

---

## 7. LoginPage

**文件**：`apps/web/src/pages/auth/LoginPage.tsx`

### 界面组织

```
SIGN IN · 01
欢迎回来，继续旅程。
使用账号或微信扫码登录漫游。

[账号登录] [微信扫码]  ← Ant Design Tabs（自定义下划线样式）

邮箱 / 手机号
  [✉ you@example.com      ]

密码
  [🔒 至少 8 位           👁]

[✓ 记住我]              [忘记密码？]  ← 忘记密码点击 message.info('暂不支持，请联系管理员')

[       登录 →           ]  ← 黑底白字，全宽，Ant Design Button type="primary"

          ── 或 ──

[  使用微信扫码登录  ]  ← 白底描边，点击 message.info('微信登录功能即将上线，敬请期待')

还没有账号？[立即注册]  ← Link navigate('/register')
```

### 提交逻辑

1. `Form.onFinish` → `postLogin({ email, password })`
2. 成功 → `auth.login(user)` + `navigate('/', { replace: true })`
3. 失败 → `message.error(err.message)`（含服务端 "邮箱或密码错误" 文案）

### Tab 切换

"微信扫码" Tab 点击时 → `message.info('微信扫码登录功能即将上线，敬请期待')` + 不切换 activeKey（保持账号登录 Tab 激活）

---

## 8. RegisterPage

**文件**：`apps/web/src/pages/auth/RegisterPage.tsx`

### 界面组织

```
CREATE · ACCOUNT          STEP 1 / 1
创建账号，开启第一段旅程。
填写以下信息，或直接使用微信注册。

昵称
  [👤 如何称呼你？          ]

邮箱
  [✉ you@example.com        ]

设置密码
  [🔒 至少 8 位，包含字母与数字  👁]

[████░░░░░░░] 密码强度：弱/一般/强/很强   ← 4 段彩色条

[  ] 我已阅读并同意《用户协议》与《隐私政策》  ← 链接路由到 /terms、/privacy

[     创建账号并出发 →      ]  ← disabled 直到所有必填 + checkbox

          ── 或 ──

[     使用微信注册          ]  ← 点击 message.info('微信注册功能即将上线，敬请期待')
```

### 密码强度算法（纯客户端，无第三方库）

```ts
function calcStrength(pw: string): 0 | 1 | 2 | 3 {
  if (pw.length < 8) return 0;
  const types = [/[a-zA-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter(r => r.test(pw)).length;
  if (types === 1) return 1;
  if (types === 2) return 2;
  return 3;
}
// 0→弱(红) 1→一般(橙) 2→强(绿) 3→很强(绿，满格)
```

强度条：4 个 `<span>` 用 Less 控制宽度与颜色，随 strength 值动态切 className。

### 提交逻辑

1. Form 校验通过 + checkbox 已勾选
2. `postRegister({ email, username, password })`
3. 成功 → `auth.login(user)` + `navigate('/', { replace: true })`
4. 失败 → `message.error(err.message)`（含 "邮箱已注册" 等服务端文案）

---

## 9. TermsPage / PrivacyPage

极简占位：白底居中，"用户协议 / 隐私政策"大标题 + "内容待定，敬请期待。" 副标题 + 返回链接。无任何实质内容。

---

## 10. App.tsx 改造

```tsx
// 改造后结构
export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* 公开路由 */}
          <Route path="/login"    element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/terms"    element={<TermsPage />} />
          <Route path="/privacy"  element={<PrivacyPage />} />
          {/* 受保护路由 */}
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<ChatPage />} />
          </Route>
          {/* 404 兜底 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
```

---

## 11. 关键文件路径速查

| 目的 | 文件 |
|---|---|
| 全局 auth state | `apps/web/src/auth/AuthContext.tsx` |
| 路由定义 + 守卫 | `apps/web/src/router/ProtectedRoute.tsx` |
| 登录 API | `apps/web/src/api/authApi.ts` |
| 左右分栏布局 | `apps/web/src/pages/auth/AuthLayout.tsx` |
| 登录表单 | `apps/web/src/pages/auth/LoginPage.tsx` |
| 注册表单 | `apps/web/src/pages/auth/RegisterPage.tsx` |
| 设计 token | `apps/web/src/theme/tokens.less` |
| 共享 auth 类型 | `packages/shared/src/auth.ts`（已有，直接用） |

---

## 12. 验证步骤

1. `pnpm -F @travel/web dev` — 访问 `http://localhost:5173/login`，确认左右分栏渲染正确
2. 访问 `http://localhost:5173/` → 自动跳转 `/login`（未登录保护）
3. 访问 `/register` → 注册表单；填写后"创建账号并出发"按钮激活
4. 成功注册 → 跳转 `/` 聊天页
5. 刷新页面 → 保持登录态（Cookie 30 天）
6. 点击"登录"→"微信扫码" Tab → 弹出 `message.info`，不切 Tab
7. 点击"使用微信扫码登录" → 弹出 `message.info`
8. 密码强度条随输入实时更新
9. 注册页 checkbox 未勾选时提交按钮 disabled
10. 访问 `/terms`、`/privacy` → 空页面正常渲染
11. `pnpm -r typecheck` 通过
