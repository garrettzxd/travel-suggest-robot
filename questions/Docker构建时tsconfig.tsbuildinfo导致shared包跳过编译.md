# Docker 构建时 tsconfig.tsbuildinfo 导致 shared 包跳过编译

## 问题表现

执行 `docker compose up --build` 时，web 镜像构建阶段报错并退出：

```
=> ERROR [web builder 11/11] RUN pnpm --filter @travel/shared build && pnpm --filter @travel/web build
```

`@travel/shared` 构建步骤仅耗时约 224ms（0.265s → 0.489s）即"成功"返回，随后 `@travel/web` 构建阶段出现大量 TypeScript 错误：

```
src/api/client.ts(1,34): error TS2307: Cannot find module '@travel/shared' or its corresponding type declarations.
src/chat/useTravelAgent.ts(2,64): error TS2307: Cannot find module '@travel/shared' or its corresponding type declarations.
src/types.ts(13,8): error TS2307: Cannot find module '@travel/shared' or its corresponding type declarations.
src/chat/cards/ItineraryCard/ItineraryCard.tsx(27,36): error TS7006: Parameter 'day' implicitly has an 'any' type.
src/chat/cards/ItineraryCard/ItineraryCard.tsx(40,27): error TS7006: Parameter 'day' implicitly has an 'any' type.
src/chat/cards/WeatherCard/WeatherCard.tsx(82,21): error TS7006: Parameter 'd' implicitly has an 'any' type.
src/chat/useTravelAgent.ts(145,41): error TS18048: 'entry' is possibly 'undefined'.
src/chat/useTravelAgent.ts(146,7): error TS2322: Type '{ status: "done"; result: unknown; name?: ToolName; args?: unknown; }' is not assignable to type 'ToolTraceEntry'.
```

同时 server 镜像构建被标记为 `CANCELED`（因 web 构建先失败）。

所有 `TS7006` / `TS18048` / `TS2322` 均为次生错误：`@travel/shared` 类型全部丢失后，依赖它的参数类型退化为 `any`。

## 问题原因

### 1. `.dockerignore` 排除了 `dist/` 但未排除 `*.tsbuildinfo`

[.dockerignore](.dockerignore) 的原始内容：

```
node_modules
.git
.env
**/node_modules
**/dist
**/.env
```

`**/dist` 确保本地构建产物不进入镜像，但 `packages/shared/tsconfig.tsbuildinfo` 未被排除，会随 `COPY packages/shared packages/shared` 一并带入容器。

### 2. `tsc -b` 读到 tsbuildinfo 后判定无需重新编译

[Dockerfile.web](Dockerfile.web) 的构建步骤：

```dockerfile
COPY packages/shared packages/shared   # 带入了 tsconfig.tsbuildinfo，但 dist/ 被 .dockerignore 过滤
COPY apps/web apps/web

RUN pnpm --filter @travel/shared build \   # tsc -b 读到 tsbuildinfo，源文件未变 → 跳过编译，不生成 dist/
 && pnpm --filter @travel/web build        # 找不到 packages/shared/dist/index.d.ts → 报错
```

`tsc -b`（project references 模式）依赖 `tsconfig.tsbuildinfo` 判断增量编译范围。当 tsbuildinfo 存在且源文件哈希与记录一致时，TypeScript 认为输出已是最新，直接退出 0，**不生成任何 `dist/` 文件**。

### 3. `@travel/shared` 的类型入口指向 dist

[packages/shared/package.json](packages/shared/package.json)：

```json
"types": "./dist/index.d.ts",
"exports": {
  ".": {
    "types": "./dist/index.d.ts",
    "import": "./dist/index.js"
  }
}
```

`pnpm install` 创建了 `node_modules/@travel/shared` → `packages/shared` 的 workspace 符号链接，TypeScript 解析类型时最终寻找 `packages/shared/dist/index.d.ts`，而该文件因步骤 2 从未被生成，导致 `Cannot find module '@travel/shared'`。

### 4. `.gitignore` 未排除 tsbuildinfo，文件被纳入版本库

[.gitignore](.gitignore) 原始内容包含 `dist` 但无 `*.tsbuildinfo`，开发者本地执行 `pnpm build` 后生成的 `packages/shared/tsconfig.tsbuildinfo` 被 git 追踪，进而出现在 Docker 构建上下文中。

## 解决方法

**两处同步修改：**

**1. `.dockerignore` 加入 `**/*.tsbuildinfo`**（直接修复 Docker 构建）

```diff
  **/dist
  **/.env
+ **/*.tsbuildinfo
```

阻止 tsbuildinfo 进入容器，`tsc -b` 在 Docker 内部始终执行完整编译。

**2. `.gitignore` 加入 `*.tsbuildinfo`**（从源头避免文件进入版本库）

```diff
  node_modules
  dist
+ *.tsbuildinfo
  .env
```

同时将已被 git 追踪的文件移出索引：

```bash
git rm --cached packages/shared/tsconfig.tsbuildinfo
```

`tsbuildinfo` 与 `dist/` 性质相同，均属构建产物，不应纳入版本管理。

## 验证方式

1. 确认 `packages/shared/tsconfig.tsbuildinfo` 不再被 git 追踪：`git status` 中不出现该文件。
2. 重新执行 `docker compose up --build`，观察 `@travel/shared` 构建耗时是否恢复正常（秒级），且无 `TS2307` 报错。
3. 构建成功后访问 `http://localhost:8080`，页面正常加载。

## 附带排除过的可能性

- ❌ `pnpm install --frozen-lockfile` 未正确建立 workspace 符号链接 —— 符号链接正常，`node_modules/@travel/shared` 指向 `packages/shared`，问题在于 `dist/` 不存在。
- ❌ Dockerfile 中 shared 与 web 构建顺序错误 —— 顺序正确（shared 先于 web），但 tsbuildinfo 导致 shared 的 `tsc -b` 实际未输出任何文件。
- ❌ `.npmrc` 镜像源导致安装失败 —— 安装步骤正常完成，报错发生在编译阶段。
