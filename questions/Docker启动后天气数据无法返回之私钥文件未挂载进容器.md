# Docker 启动后天气数据无法返回之私钥文件未挂载进容器

## 问题表现

- 环境：通过 `docker compose up` 启动，前端访问 `http://localhost:8080`，后端服务运行在 `http://localhost:3001`。
- 现象：发起聊天请求时，天气查询工具无法正常返回数据，调用 QWeather API 的步骤静默失败或报错，最终用户看不到天气卡片。
- 本地 `pnpm dev` 启动时天气数据正常，Docker 环境下才复现。

## 问题原因

### 1. `Dockerfile.server` runner 阶段未复制 `secrets/` 目录

[Dockerfile.server](Dockerfile.server) 的 runner 阶段只从 builder 拷贝了编译产物：

```dockerfile
COPY --from=builder /app/packages/shared/dist /app/packages/shared/dist
COPY --from=builder /app/apps/server/dist /app/apps/server/dist
```

`secrets/` 目录从未出现在任何 `COPY` 指令中，容器内根本不存在该目录。

### 2. `QWEATHER_PRIVATE_KEY_PATH` 使用相对路径，在容器内解析到错误位置

[.env.example](.env.example) 和实际 `.env` 中配置的路径：

```
QWEATHER_PRIVATE_KEY_PATH=../../secrets/qweather-ed25519-private.pem
```

这条相对路径是为本地开发设计的：从 `apps/server/` 目录启动时，`../../secrets` 正确解析到仓库根目录的 `secrets/`。

但容器内 `WORKDIR` 为 `/app/apps/server`，`../../secrets` 解析为 `/app/secrets`，而该路径在容器中不存在，导致 [qweatherAuth.ts:33](apps/server/src/agent/tools/qweatherAuth.ts) 的 `readFile` 调用抛出文件不存在错误：

```typescript
const pem = await readFile(env.QWEATHER_PRIVATE_KEY_PATH, "utf8");
```

### 3. `docker-compose.yml` 未配置 volume 挂载

原始 [docker-compose.yml](docker-compose.yml) 的 server 服务没有 `volumes` 字段，宿主机的 `secrets/` 目录与容器完全隔离。

## 解决方法

**不修改 `.env`**（保持本地开发可用），改为在 `docker-compose.yml` 中同时挂载目录并覆盖路径变量：

```diff
  server:
    env_file:
      - .env
    environment:
      PORT: 3001
      CORS_ORIGIN: http://localhost:8080
+     QWEATHER_PRIVATE_KEY_PATH: /app/secrets/qweather-ed25519-private.pem
+   volumes:
+     - ./secrets:/app/secrets:ro
    ports:
      - "3001:3001"
```

- `volumes` 将宿主机 `secrets/` 以只读方式挂载到容器的 `/app/secrets`。
- `environment.QWEATHER_PRIVATE_KEY_PATH` 覆盖 `env_file` 中的相对路径，使容器内使用绝对路径 `/app/secrets/qweather-ed25519-private.pem`。
- Docker Compose 中 `environment` 的优先级高于 `env_file`，无需改动 `.env`，本地开发不受影响。

## 验证方式

1. 执行 `docker compose up`（无需 `--build`，配置变更不涉及镜像层）。
2. 在前端发起一条包含地名的天气查询，观察是否正常返回天气卡片。
3. 或直接查看 server 容器日志，确认出现类似以下诊断输出而非报错：
   ```
   [qweather-auth] JWT issued | host=... kid=... sub=... jwt=...
   ```

## 附带排除过的可能性

- ❌ QWeather API 密钥配置错误（`QWEATHER_KEY_ID` / `QWEATHER_PROJECT_ID`）—— 这两个变量通过 `env_file` 正常注入，本地与 Docker 一致，不是根因。
- ❌ 网络问题导致容器无法访问 QWeather API —— 报错发生在读取私钥文件阶段，未到达网络请求步骤。
