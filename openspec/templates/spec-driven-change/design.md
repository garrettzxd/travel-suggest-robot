## Context

- 现状：
  - <当前实现位于哪些文件 / 哪一层>
  - <当前行为是什么>
- 本次变更入口：
  - <用户请求 / 问题现象 / PRD 条目 / 排障结论>
- 现有限制：
  - <例如仅桌面端、只支持 SSE、依赖某 provider、不能改 agent 结构等>

## Goals / Non-Goals

**Goals:**

- <目标 1>
- <目标 2>
- <目标 3>

**Non-Goals:**

- <明确不做的内容 1>
- <明确不做的内容 2>

## Affected Layers

- `packages/shared`:
  - <是否新增 / 修改类型、事件、常量；无则写“无”>
- `apps/server`:
  - <是否修改路由、工具、provider、SSE 组织逻辑；无则写“无”>
- `apps/web`:
  - <是否修改页面、hook、组件、样式、状态流；无则写“无”>

## Decisions

### 1. <关键决策标题>

- Decision:
  - <做什么>
- Rationale:
  - <为什么这么做，而不是另一种方案>
- Rejected alternatives:
  - <放弃的方案及原因，可选>

### 2. Data Flow / Responsibility

- 请求入口：
  - <例如 `ChatPage -> useTravelAgent -> /api/chat -> chat route -> agent/tool`>
- 数据返回：
  - <例如 SSE token/tool/final 事件如何进入 UI>
- 职责边界：
  - `shared` 负责 <...>
  - `server` 负责 <...>
  - `web` 负责 <...>

### 3. Compatibility / Migration

- 是否有字段兼容问题：
  - <有 / 无，具体说明>
- 是否需要迁移旧数据或旧组件：
  - <有 / 无，具体说明>
- 是否需要重启 dev server / 重新构建：
  - <例如修改 vite.config.ts 需要重启>

## Validation Plan

- 类型检查：
  - `pnpm -r typecheck`
- 构建验证：
  - `pnpm build`
- 手工验证：
  - <关键链路 1>
  - <关键链路 2>
  - <关键链路 3>

## Risks / Trade-offs

- <风险 1：表现 / 原因 / 缓解手段>
- <风险 2：表现 / 原因 / 缓解手段>

## Documentation Sync

- 需要同步的 `plans/` 文档：
  - <列出文件或写“无”>
- 需要同步的 `questions/` 文档：
  - <列出文件或写“无”>
