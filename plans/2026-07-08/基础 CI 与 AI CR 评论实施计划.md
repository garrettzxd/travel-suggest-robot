# 基础 CI 与 AI CR 评论实施计划

## 1. 目标

先落地第一阶段能力：当开发者提交 Pull Request 或更新 Pull Request 时，GitHub Actions 自动完成基础质量检查，并调用大模型对本次改动做 Code Review，最后把审查结果以 PR 评论形式发布或更新。

本阶段不包含生产部署、阿里云打包发布和服务重启。部署流水线会在基础 CI 与 AI CR 稳定后单独实施。

## 2. 当前项目背景

当前仓库为 GitHub 仓库：

```text
git@github.com:garrettzxd/travel-suggest-robot.git
```

项目形态：

- Monorepo：`pnpm workspace`
- Node 版本：`>=24`
- 包管理器：`pnpm@10.0.0`
- 前端：`apps/web`，React + Vite
- 后端：`apps/server`，Koa + TypeScript
- 共享包：`packages/shared`
- 现有根脚本：
  - `pnpm typecheck`
  - `pnpm build`
  - `pnpm build:shared`
  - `pnpm build:server`
  - `pnpm build:web`

## 3. 本阶段交付物

建议新增以下文件：

```text
.github/workflows/ci.yml
.github/workflows/ai-code-review.yml
.github/scripts/ai-code-review.mjs
.github/scripts/pr-comment.mjs
docs/ci-ai-review.md
```

说明：

- `ci.yml`：基础 CI，负责安装依赖、类型检查、构建。
- `ai-code-review.yml`：AI CR 工作流，负责提取 PR diff、调用大模型、写入 PR 评论。
- `ai-code-review.mjs`：封装大模型调用逻辑。
- `pr-comment.mjs`：封装创建或更新 PR 评论逻辑，避免每次提交都产生重复评论。
- `docs/ci-ai-review.md`：后续维护文档，记录 Secret、触发规则、排障方式。

如果希望文件更少，也可以把 `pr-comment.mjs` 逻辑合并进 `ai-code-review.mjs`，第一版建议拆开，便于排障。

## 4. 工作流设计

### 4.1 基础 CI

触发条件：

```yaml
on:
  pull_request:
    branches:
      - main
  push:
    branches:
      - main
```

执行步骤：

1. Checkout 代码。
2. 安装 Node.js 24。
3. 启用 pnpm 10。
4. 安装依赖：

```bash
pnpm install --frozen-lockfile
```

5. 类型检查：

```bash
pnpm typecheck
```

6. 构建检查：

```bash
pnpm build
```

建议后续再补充 lint/test；当前项目尚未配置统一 lint/test 脚本，第一阶段不强行引入。

### 4.2 AI Code Review

触发条件：

```yaml
on:
  pull_request:
    types:
      - opened
      - synchronize
      - reopened
      - ready_for_review
```

跳过条件：

- Draft PR 可选择跳过，等 `ready_for_review` 后再执行。
- 只改文档、图片、锁文件时可选择降级审查或跳过。
- Diff 超过阈值时截断，并在评论中说明。

执行步骤：

1. Checkout PR 代码，拉取 base 分支。
2. 获取 PR 元信息：
   - PR 标题
   - PR 描述
   - base 分支
   - head 分支
   - 作者
3. 获取变更文件列表：

```bash
git diff --name-status origin/main...HEAD
```

4. 获取 diff：

```bash
git diff --unified=80 origin/main...HEAD
```

5. 过滤不适合发送给大模型的内容：
   - `.env`
   - `.env.*`
   - `secrets/**`
   - `*.pem`
   - `*.key`
   - 大型二进制文件
   - `pnpm-lock.yaml` 可只保留文件变更提示，不发送完整 diff
6. 调用大模型生成审查结果。
7. 使用 GitHub API 发布或更新 PR 评论。

评论需要包含固定标记：

```md
<!-- ai-code-review -->
```

这样后续更新 PR 时可以找到上一条 AI CR 评论并覆盖，避免评论区刷屏。

## 5. AI CR 输出格式

建议要求大模型固定输出：

```md
<!-- ai-code-review -->

## AI Code Review

### 总体结论

### 高风险问题

### 中风险问题

### 低风险建议

### 测试建议

### 合并建议
```

审查重点：

- 类型错误或潜在运行时异常
- React 状态更新、流式请求、SSE 处理风险
- Koa 路由、鉴权、输入校验风险
- SQLite/Drizzle migration 和数据一致性风险
- Docker/环境变量相关风险
- 安全问题，例如敏感信息泄露、未授权访问、XSS
- 是否缺少必要测试或手动验证说明

审查语气：

- 明确区分“必须修复”和“建议优化”。
- 只基于 diff 与可见上下文评论，不确定时标注“需要人工确认”。
- 不输出空泛建议。
- 不泄露 prompt、token、Secret。

## 6. 需要你提供或确认的信息

### 6.1 GitHub 仓库权限

需要确认你是否拥有该 GitHub 仓库的管理员权限，至少需要能够：

- 新增或修改 `.github/workflows/**`
- 在仓库 Settings 中配置 Actions Secrets
- 配置分支保护规则
- 查看 Actions 运行日志

是否需要额外提供 GitHub Token：

- 第一版通常不需要你额外提供 GitHub Token。
- GitHub Actions 默认提供 `GITHUB_TOKEN`，可以用于读取代码、读取 PR 信息、创建或更新 PR 评论。
- 只有当仓库策略禁用了 `GITHUB_TOKEN` 写评论权限，才需要额外创建 Fine-grained Personal Access Token。

如需额外 PAT，最小权限建议：

```text
Repository access: only garrettzxd/travel-suggest-robot
Permissions:
- Contents: Read-only
- Pull requests: Read and write
- Issues: Read and write
- Metadata: Read-only
```

说明：GitHub 的 PR 评论走 Issues API，所以需要 `Issues: Read and write`。

### 6.2 大模型服务信息

当前项目已有 Moonshot/Kimi 相关环境变量，第一版建议沿用。

需要你提供：

```text
MOONSHOT_API_KEY
MOONSHOT_MODEL
MOONSHOT_BASE_URL
```

建议值：

```text
MOONSHOT_MODEL=kimi-k2.6
MOONSHOT_BASE_URL=https://api.moonshot.cn/v1
```

如果你希望用 OpenAI 或其他 OpenAI-compatible 服务，需要提供：

```text
OPENAI_API_KEY
OPENAI_MODEL
OPENAI_BASE_URL
```

二选一即可，不建议第一版同时支持太多供应商。

### 6.3 AI CR 行为偏好

需要你确认：

- Draft PR 是否跳过 AI CR：建议跳过。
- AI CR 是否作为必需检查：建议第一阶段不作为阻塞项。
- Diff 最大输入长度：建议第一版 100k 字符。
- 是否允许模型审查锁文件：建议只提示锁文件变化，不传完整 `pnpm-lock.yaml` diff。
- 评论语言：建议中文。
- 是否在 CI 失败时仍执行 AI CR：建议执行，但评论中标明基础 CI 失败。

### 6.4 分支保护策略

需要你确认 main 分支是否启用保护。

建议第一阶段配置：

```text
Require a pull request before merging: enabled
Require status checks to pass before merging: enabled
Required checks:
- ci
```

暂不建议把 AI CR 设置为必需检查，因为模型服务可能受限于网络、余额、限流或偶发失败。AI CR 初期作为辅助评论更稳。

## 7. GitHub Secrets 配置清单

第一版必需：

```text
MOONSHOT_API_KEY
MOONSHOT_MODEL
MOONSHOT_BASE_URL
```

如果使用 OpenAI-compatible 命名，也可以改成：

```text
AI_REVIEW_API_KEY
AI_REVIEW_MODEL
AI_REVIEW_BASE_URL
```

可选：

```text
AI_REVIEW_MAX_DIFF_CHARS=100000
AI_REVIEW_LANGUAGE=zh-CN
AI_REVIEW_SKIP_DRAFT=true
AI_REVIEW_PROVIDER=moonshot
```

通常不需要：

```text
GH_TOKEN
```

只有当默认 `GITHUB_TOKEN` 无法评论 PR 时再加。

## 8. GitHub Actions 权限配置

`ci.yml` 建议：

```yaml
permissions:
  contents: read
```

`ai-code-review.yml` 建议：

```yaml
permissions:
  contents: read
  pull-requests: read
  issues: write
```

原因：

- `contents: read` 用于 checkout 和读取 diff。
- `pull-requests: read` 用于读取 PR 信息。
- `issues: write` 用于创建或更新 PR 评论。

## 9. 安全边界

需要明确：

- 不把 `.env`、`secrets/`、私钥、证书发送给大模型。
- 不把完整 Actions 环境变量打印到日志。
- 不在 PR 评论里输出 Secret。
- 不使用 `pull_request_target` 运行未受信任 PR 代码。
- 私有仓库内部分支 PR 使用 `pull_request` 即可。
- 如果未来开放 fork PR，需要重新设计权限模型。

第一版建议只支持仓库内部分支 PR。

## 10. 实施步骤

### 步骤一：新增基础 CI

新增 `.github/workflows/ci.yml`：

- 使用 Node.js 24。
- 使用 pnpm 10。
- 执行 `pnpm install --frozen-lockfile`。
- 执行 `pnpm typecheck`。
- 执行 `pnpm build`。

验收：

- 新建 PR 后出现 CI 检查。
- CI 成功时 PR Checks 变绿。
- 人为制造类型错误时 CI 失败。

### 步骤二：新增 AI CR 脚本

新增 `.github/scripts/ai-code-review.mjs`：

- 读取 GitHub Actions 环境变量。
- 读取 PR diff 文件。
- 构造审查 prompt。
- 调用大模型接口。
- 输出 Markdown 审查结果。

验收：

- 本地可用 mock diff 调试 prompt。
- Actions 中可生成 `review.md`。
- 模型接口失败时脚本给出明确错误。

### 步骤三：新增 PR 评论脚本

新增 `.github/scripts/pr-comment.mjs`：

- 使用 `GITHUB_TOKEN`。
- 查找当前 PR 下包含 `<!-- ai-code-review -->` 的评论。
- 存在则更新。
- 不存在则创建。

验收：

- 第一次运行创建评论。
- 后续 push 更新同一条评论。
- 评论不会刷屏。

### 步骤四：新增 AI CR Workflow

新增 `.github/workflows/ai-code-review.yml`：

- 仅在 PR 事件触发。
- 安装 Node/pnpm。
- 生成 diff。
- 调用 AI CR 脚本。
- 调用 PR 评论脚本。

验收：

- PR 打开后自动评论。
- PR 更新后评论被覆盖。
- Draft PR 行为符合预期。
- 大 diff 有截断提示。

### 步骤五：配置分支保护

在 GitHub 仓库 Settings 中配置 main 分支保护：

- 要求 PR 合并。
- 要求 `ci` 通过。
- AI CR 暂不设为 required。

验收：

- main 不能绕过 PR 直接合并，除非管理员允许。
- CI 失败时无法合并。

## 11. 风险与处理

### 风险一：大模型服务失败导致流程失败

建议：

- 第一阶段 AI CR workflow 可以失败，但不阻塞 merge。
- 或者设置 `continue-on-error: true`，并在 PR 评论里提示“AI CR 暂不可用”。

### 风险二：diff 太大导致 token 超限

建议：

- 设置最大 diff 字符数。
- 优先保留源码文件。
- 跳过 lockfile 和二进制文件。
- 评论中明确哪些文件未审查。

### 风险三：GitHub Token 权限不足

处理：

- 先检查 workflow `permissions`。
- 再检查仓库 Settings > Actions > Workflow permissions。
- 如果仍不允许评论，再配置 Fine-grained PAT。

### 风险四：Secret 泄露

处理：

- 过滤敏感路径。
- 不打印 prompt 全文。
- 不打印请求 headers。
- 不在 workflow 中 echo secret。

### 风险五：AI 评论质量不稳定

处理：

- 固定输出结构。
- 限定审查范围。
- 明确让模型只评论 diff 中能证实的问题。
- 初期不作为强制阻塞项。

## 12. 验收标准

基础 CI 验收：

- PR 创建后自动执行。
- `pnpm install --frozen-lockfile` 成功。
- `pnpm typecheck` 成功。
- `pnpm build` 成功。
- CI 失败能在 PR Checks 中看到明确错误。

AI CR 验收：

- PR 创建后自动发布一条 AI CR 评论。
- PR 更新后原评论被更新，不重复刷屏。
- 评论包含总体结论、风险项、测试建议和合并建议。
- 敏感文件不会被发送给大模型。
- 模型失败时有清晰提示，不影响基础 CI。

权限验收：

- 无需额外 GitHub Token 时，`GITHUB_TOKEN` 能正常评论。
- 如需 PAT，权限限定在当前仓库，且只授予最小权限。

## 13. 推荐实施顺序

1. 你确认大模型服务商和模型名。
2. 在 GitHub Secrets 中配置模型 API Key。
3. 新增基础 CI workflow。
4. 开一个测试 PR，确认 CI 跑通。
5. 新增 AI CR 脚本和 workflow。
6. 在测试 PR 上验证评论创建与更新。
7. 配置 main 分支保护。
8. 观察 3-5 个真实 PR 后，再决定 AI CR 是否需要更严格地参与合并策略。

## 14. 你需要现在准备的信息清单

必需：

```text
1. GitHub 仓库管理员权限是否可用
2. 大模型供应商：Moonshot / OpenAI / 其他 OpenAI-compatible
3. 大模型 API Key
4. 大模型 model 名称
5. 大模型 base URL
```

建议确认：

```text
1. Draft PR 是否跳过 AI CR
2. AI CR 评论语言是否固定中文
3. AI CR 是否允许失败且不阻塞合并
4. main 分支是否开启保护
5. 是否只支持仓库内部分支 PR，不支持 fork PR
```

不一定需要：

```text
1. GitHub Personal Access Token
```

只有当 GitHub Actions 自带的 `GITHUB_TOKEN` 无法创建或更新 PR 评论时，才需要额外提供 PAT。
