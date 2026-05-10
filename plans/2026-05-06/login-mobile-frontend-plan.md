# 移动端登录 / 注册页面 — 前端适配方案

## Context

PC 版登录 / 注册已经按 `plans/2026-05-06/login-pc-frontend-plan.md` 完成，并在后续调整中删除了微信相关入口、多语言切换、帮助中心入口。移动端需要参考 `plans/2026-05-06/login-mobile.html` 的视觉稿，在不改变认证流程的前提下，为 `/login` 和 `/register` 补充小屏样式。

本次适配遵循一个原则：**逻辑与 PC 端保持一致，只做 UI 响应式差异**。

---

## 1. 范围

### 需要实现

- 登录页在移动端显示顶部标题、品牌区、白色表单卡片、底部注册入口。
- 注册页在移动端显示顶部返回、深色 hero 卡片、白色表单卡片、功能色块、底部登录入口。
- 复用现有 `postLogin`、`postRegister`、`AuthContext`、路由跳转和表单校验逻辑。
- 移动端继续保留 PC 端已调整后的删除逻辑：
  - 不显示微信扫码 Tab
  - 不显示微信登录按钮
  - 不显示微信注册按钮
  - 不显示多语言切换
  - 不显示帮助中心

### 不在范围

- 不新增独立移动端路由。
- 不新增微信 OAuth / 扫码能力。
- 不改后端 auth 接口。
- 不引入新的 UI / icon 依赖。

---

## 2. 设计参考

设计稿：`plans/2026-05-06/login-mobile.html`

设计稿里的原始结构包含：

- `LoginScreen`
  - 顶部栏：标题“登录”
  - 品牌区：指南针图标 + 漫游 / TRAVEL · AI
  - 文案：欢迎回来，继续你的旅程
  - 白色表单卡片：邮箱、密码、记住我、忘记密码、登录按钮
  - 底部：立即注册、版本标识

- `RegisterScreen`
  - 顶部栏：返回按钮 + 标题“注册”
  - 深色 hero：旅途风景占位 + START 文案
  - 白色表单卡片：创建账号、昵称、邮箱、密码、协议勾选、提交按钮
  - 功能色块：景点 / 天气 / 行程
  - 底部：直接登录、版本标识

注意：设计稿里存在“或使用第三方 / 微信登录 / 微信注册”入口，实际实现时按 PC 调整要求删除。

---

## 3. 改动文件

```
apps/web/src/pages/auth/
├── AuthLayout.tsx        # 增加移动端顶栏结构
├── AuthLayout.less       # 增加移动端整体布局响应式规则
├── LoginPage.tsx         # 增加移动端品牌区、版本标识
├── LoginPage.less        # 增加移动端登录页样式
├── RegisterPage.tsx      # 增加移动端 hero、表单标题、功能色块、登录入口
└── RegisterPage.less     # 增加移动端注册页样式
```

---

## 4. AuthLayout 移动端方案

PC 端仍保持左右分栏：

```
LeftPanel dark marketing area + RightPanel form area
```

移动端在 `max-width: 768px` 下切换为单列：

```less
.auth-left {
  display: none;
}

.auth-right {
  height: 100%;
  background: #ededed;
  overflow: hidden;
}

.auth-right-content {
  max-width: none;
  width: 100%;
  padding: 0;
  overflow-y: auto;
}
```

移动端顶部栏：

- 登录页：居中标题“登录”
- 注册页：左侧返回按钮，居中标题“注册”
- 隐藏 PC 顶栏里的 `MANYOU · WEB`、登录/注册分段按钮
- 不提供多语言切换

---

## 5. LoginPage 移动端方案

### 结构

```tsx
<div className="login-mobile-brand">
  <div className="mobile-brand-icon">compass svg</div>
  <div>
    <div className="mobile-brand-name">漫游</div>
    <div className="mobile-brand-sub">TRAVEL · AI</div>
  </div>
</div>

<h1>欢迎回来，继续旅程。</h1>
<p>使用账号登录漫游。</p>

<Form className="login-form">...</Form>

<div className="login-register-row">
  还没有账号？立即注册
</div>

<div className="login-mobile-footer">
  MANYOU · TRAVEL · AI · v1.0
</div>
```

### 样式要点

- 页面背景：`#ededed`
- 页面 padding：`22px 16px 20px`
- 表单卡片：
  - 白底
  - `border: 1px solid #dcdcdc`
  - `border-radius: 12px`
  - `box-shadow: 0 1px 8px rgba(42, 42, 42, 0.06)`
- 输入框高度：`42px`
- 主按钮高度：`44px`
- 明确设置 `box-sizing: border-box`、`width: 100%`、`max-width: 100%`，避免移动端横向溢出。

### 删除项

移动端登录页不实现：

- 微信扫码 Tab
- 分隔线“或”
- 使用微信扫码登录按钮

---

## 6. RegisterPage 移动端方案

### 结构

```tsx
<div className="register-mobile-hero">
  <div className="hero-pattern">HERO · 旅途风景</div>
  <div className="hero-copy">
    <div>START · 你的第一段旅程</div>
    <div>把城市名，变成出发的勇气</div>
    <div>天气、景点、行程，三步给到你。</div>
  </div>
</div>

<Form className="register-form">
  <div className="register-mobile-form-title">
    <span>创建账号</span>
    <span>STEP · 1 / 1</span>
  </div>
  ...
</Form>

<div className="register-mobile-features">
  <div>景点 / AI 精选</div>
  <div>天气 / 实时 7 日</div>
  <div>行程 / 一键规划</div>
</div>

<div className="register-login-row">
  已有账号？直接登录
</div>
```

### 样式要点

- 页面背景：`#ededed`
- 页面 padding：`16px 16px 20px`
- hero：
  - 深色背景：`#2a2a2a`
  - 斜纹占位图
  - `border-radius: 10px`
- 表单卡片同登录页，保持白底圆角卡片样式。
- 功能色块：
  - 景点：`#faddda`
  - 天气：`#d5f2f4`
  - 行程：`#ddd4cd`
- 移动端隐藏 PC 的 `CREATE · ACCOUNT`、大标题、副标题，由移动端 hero 和卡片标题承担信息层级。

### 删除项

移动端注册页不实现：

- 分隔线“或使用第三方”
- 使用微信注册按钮

---

## 7. 交互逻辑

登录：

1. 用户填写邮箱和密码。
2. 点击“登录”。
3. 调用 `postLogin({ email, password })`。
4. 成功后 `auth.login(user)`，跳转 `/`。
5. 失败后 `message.error(...)`。

注册：

1. 用户填写昵称、邮箱、密码。
2. 勾选用户协议与隐私政策。
3. 点击“创建账号并出发”。
4. 调用 `postRegister(values)`。
5. 成功后 `auth.login(user)`，跳转 `/`。
6. 未勾选协议时按钮保持 disabled，提交前仍保留 warning 防线。

跳转：

- 登录页“立即注册” → `/register`
- 注册页返回按钮 / “直接登录” → `/login`
- 用户协议 / 隐私政策链接沿用 `/terms`、`/privacy`

---

## 8. 验证项

### 静态验证

```bash
pnpm --filter @travel/web typecheck
pnpm --filter @travel/web build
```

### 文案 / 入口残留扫描

```bash
rg -n "微信|Wechat|WeChat|扫码|简体中文|帮助中心|login-wechat|register-wechat|nav-locale|或使用第三方" apps/web/src apps/web/dist
```

预期：无结果。

### 视觉验证

使用 Chrome DevTools Protocol 模拟移动端 viewport：

- `width=390`
- `height=844`
- `mobile=true`

验证页面：

- `/login`
- `/register`

检查项：

- `innerWidth === 390`
- `document.body.getBoundingClientRect().width === 390`
- 页面根节点宽度为 390，无横向溢出
- 表单卡片完整显示
- 微信 / 语言切换 / 帮助中心入口不可见

---

## 9. 回归风险

- `AuthLayout.less` 中响应式规则必须放在 PC 基础样式之后，确保移动端覆盖生效。
- 移动端新增的 DOM 节点默认 `display: none`，只在 `max-width: 768px` 下显示，避免影响 PC。
- Ant Design 表单组件有默认宽度与边距，移动端卡片必须显式设置 `box-sizing: border-box`、`width: 100%`、`max-width: 100%`。

---

## 10. 最终产出

移动端登录 / 注册已与 PC 共用同一套认证逻辑，并按移动端设计稿完成响应式 UI 差异：

- PC：左右分栏大屏登录 / 注册
- Mobile：单列卡片式登录 / 注册
- 微信、多语言、帮助中心入口均按最新业务要求删除
