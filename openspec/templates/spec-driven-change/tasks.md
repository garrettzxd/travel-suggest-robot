## 1. Shared / Protocol

- [ ] 1.1 判断本次变更是否需要修改 `packages/shared` 的类型、SSE 常量或协议定义
- [ ] 1.2 如涉及协议联动，补齐共享类型并检查前后端引用

## 2. Server

- [ ] 2.1 实现 `apps/server` 侧所需改动
- [ ] 2.2 检查路由、工具、流式输出、兼容性和错误处理

## 3. Web

- [ ] 3.1 实现 `apps/web` 侧页面、组件、hook 或样式改动
- [ ] 3.2 检查交互、状态同步、loading、错误态与空态

## 4. Validation

- [ ] 4.1 运行 `pnpm -r typecheck`
- [ ] 4.2 如变更影响构建链路、Vite、shared 或前后端联动，运行 `pnpm build`
- [ ] 4.3 补充真实的手工验证结果，不要虚构测试结论

## 5. Documentation

- [ ] 5.1 如影响产品方案或视觉设计，同步更新 `plans/`
- [ ] 5.2 如包含排障、兼容性、代理或协议结论，同步更新 `questions/`
- [ ] 5.3 更新 change 内文档，保证 proposal / spec / design / tasks 一致
