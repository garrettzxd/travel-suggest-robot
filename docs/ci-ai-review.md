# CI 与 AI Code Review

本项目使用 GitHub Actions 完成第一阶段 CI/CD 能力：

- `CI`：对 PR 和 main 分支执行依赖安装、类型检查和构建。
- `AI Code Review`：对 PR diff 调用大模型生成审查意见，并发布或更新同一条 PR 评论。

## Workflow 文件

```text
.github/workflows/ci.yml
.github/workflows/ai-code-review.yml
```

## 必需 Secrets

在 GitHub 仓库 `Settings -> Secrets and variables -> Actions` 中配置：

```text
MOONSHOT_API_KEY
MOONSHOT_MODEL
MOONSHOT_BASE_URL
```

Kimi 推荐配置：

```text
MOONSHOT_BASE_URL=https://api.moonshot.cn/v1
```

AI CR 脚本也兼容 `https://api.moonshot.cn`，会自动补全为 `https://api.moonshot.cn/v1/chat/completions`。

脚本默认不传 `temperature`。部分 Kimi 模型会拒绝非 `1` 的 temperature，例如返回 `invalid temperature: only 1 is allowed for this model`。

也可以使用更通用的命名：

```text
AI_REVIEW_API_KEY
AI_REVIEW_MODEL
AI_REVIEW_BASE_URL
```

如果两组都存在，workflow 会优先使用 `AI_REVIEW_*`。

## 可选 Variables

在 GitHub 仓库 `Settings -> Secrets and variables -> Actions -> Variables` 中配置：

```text
AI_REVIEW_MAX_DIFF_CHARS=35000
AI_REVIEW_LANGUAGE=zh-CN
AI_REVIEW_MAX_OUTPUT_TOKENS=1800
```

## 触发规则

`CI` 会在以下场景触发：

- PR 指向 `main`
- push 到 `main`

项目是 pnpm workspace。`@travel/shared` 的类型声明指向 `packages/shared/dist`，因此 `pnpm typecheck` 会先执行 `pnpm build:shared`，再执行全仓 `pnpm -r typecheck`。否则 fresh clone 的 CI 环境中 web/server 可能找不到 `@travel/shared` 的声明文件。

`AI Code Review` 会在以下 PR 事件触发：

- `opened`
- `synchronize`
- `reopened`
- `ready_for_review`

Draft PR 会跳过 AI CR。

Fork PR 也会跳过 AI CR。GitHub 在 `pull_request` 事件中不会向 fork PR 暴露仓库 Secrets，且 `GITHUB_TOKEN` 通常没有写评论权限。

## 敏感文件过滤

AI CR 不会把以下文件的 diff 发送给大模型：

- `.env`
- `.env.*`
- `secrets/**`
- `*.pem`
- `*.key`
- `pnpm-lock.yaml`

`pnpm-lock.yaml` 仍会出现在变更文件列表中，但不会发送完整 diff。

## 评论策略

AI CR 评论包含固定标记：

```md
<!-- ai-code-review -->
```

每次 PR 更新时，脚本会优先更新已有 AI CR 评论，避免重复刷屏。

AI CR 还会根据模型输出发布最多 5 条行内 review comments。行内评论只会发布到当前 diff 中存在的新版本行号；如果模型返回的文件或行号不在 diff 里，脚本会自动丢弃，避免 GitHub API 报 422。

行内评论包含固定标记：

```md
<!-- ai-code-review-inline -->
```

每次重新运行时，脚本会删除上一轮 bot 生成的行内 AI 评论，再发布新一轮结果。

## 合并建议

第一阶段建议：

- 将 `CI` 设置为 main 分支保护的必需检查。
- 不要把 `AI Code Review` 设置为必需检查。

AI CR 依赖外部模型服务，可能受余额、限流、网络波动影响。它更适合作为辅助审查，而不是第一阶段的硬门禁。

## 常见报错

### `AI_REVIEW_API_KEY or MOONSHOT_API_KEY is required`

说明 workflow 没有拿到大模型 API Key。请检查：

- Secret 是否配置在 `Settings -> Secrets and variables -> Actions -> Secrets`，不是 Variables。
- Secret 名称是否为 `MOONSHOT_API_KEY` 或 `AI_REVIEW_API_KEY`。
- 当前 PR 是否来自 fork。fork PR 默认拿不到仓库 Secrets。

### `Resource not accessible by integration`

通常说明本次 workflow 的 `GITHUB_TOKEN` 没有写 PR 评论权限。请检查：

- 仓库 `Settings -> Actions -> General -> Workflow permissions` 是否为 `Read and write permissions`。
- workflow 是否声明了 `issues: write` 和 `pull-requests: write`。
- 当前 PR 是否来自 fork。fork PR 的 token 通常不能写仓库评论。
- 如果仓库属于组织，还要检查组织级 `Settings -> Actions -> General -> Workflow permissions` 是否限制为只读。
