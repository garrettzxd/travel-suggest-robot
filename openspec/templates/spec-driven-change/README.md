# OpenSpec 变更模板

这是一份面向当前仓库的可复用模板，用于快速创建新的 OpenSpec change。

## 适用场景

- 需要记录一次跨 `apps/web`、`apps/server`、`packages/shared` 的功能变更
- 需要保留协议、UI、排障、兼容性等上下文，避免后续迭代重新读代码
- 希望继续使用 OpenSpec 默认的 `spec-driven` 工作流：`proposal -> specs -> design -> tasks`

## 推荐用法

1. 先用 OpenSpec CLI 创建 change 骨架：

```bash
openspec new change <change-name>
```

2. 再把这份模板里的内容复制到对应 change 目录：

```text
openspec/changes/<change-name>/
├── proposal.md
├── design.md
├── tasks.md
└── specs/
    └── <capability-name>/
        └── spec.md
```

3. 把所有占位符替换掉：

- `<change-name>`：change 名，使用 kebab-case
- `<capability-name>`：能力名，使用 kebab-case
- `<...>`：待填写内容

## 目录说明

- [proposal.md](./proposal.md)：说明为什么改、改什么、影响什么
- [design.md](./design.md)：说明如何实现、职责边界、风险和兼容性
- [tasks.md](./tasks.md)：按 `shared / server / web / docs` 拆任务
- [specs/capability-name/spec.md](./specs/capability-name/spec.md)：沉淀能力层面的行为变化

## 项目内建议

- 涉及 SSE、聊天协议、共享类型时，优先同时检查 `packages/shared`、`apps/server`、`apps/web`
- 涉及交互流程、PRD、视觉方案时，同步更新 `plans/`
- 涉及排障、代理、协议兼容、浏览器行为时，同步更新 `questions/`
- 没有自动化测试时，不要在模板里虚构测试结论；把真实验证步骤写清楚
