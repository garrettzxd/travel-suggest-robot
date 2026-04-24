## Why

- 当前问题或机会：
  - <当前用户痛点 / 技术问题 / 维护成本>
- 为什么现在要做：
  - <触发背景，例如新需求、线上问题、视觉改版、协议变更>
- 如果不做会怎样：
  - <业务影响 / 迭代成本 / 调试成本 / 一致性问题>

## What Changes

- <变更 1：新增什么能力或页面>
- <变更 2：修改什么交互、协议或数据流>
- <变更 3：不再保留什么旧行为，如适用>

## Capabilities

### New Capabilities

- `<capability-name>`: <一句话描述新增能力覆盖的范围>

### Modified Capabilities

- `<existing-capability-name>`: <一句话描述哪些既有 requirement 被修改>

### Removed Capabilities

- `<obsolete-capability-name>`: <一句话描述废弃或下线的能力，可选>

## Impact

- Affected workspaces:
  - `apps/web`: <受影响模块或页面>
  - `apps/server`: <受影响路由、工具、provider、数据聚合逻辑>
  - `packages/shared`: <受影响类型、协议、常量；如果没有写“无”>
- Affected APIs / protocols:
  - <例如 `/api/chat`、SSE event、shared 类型、前端请求参数>
- Compatibility impact:
  - <向后兼容 / 部分兼容 / 存在破坏性变更>
- Risks:
  - <流式中断 / 代理不兼容 / UI 回退 / 数据字段缺失 / 性能影响>
- Rollback:
  - <如何回滚，回滚影响什么>
- Docs to update:
  - `plans/<...>.md`
  - `questions/<...>.md`
  - <没有则写“无”>
