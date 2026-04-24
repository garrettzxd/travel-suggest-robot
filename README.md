# Travel Suggest Robot

A Chinese-language travel planning chatbot. Given a destination, it recommends local attractions, fetches current + 7-day weather, and decides whether now is a good time to visit. Non-travel topics are politely refused.

Stack: pnpm workspaces, Node 24 (ESM), TypeScript, Koa + LangChain v1 (Kimi/Moonshot LLM) on the server; React 19 + Vite 6 + Ant Design X on the web.

## Prerequisites

- Node 24 (`nvm use`)
- pnpm 10

## Install

```bash
pnpm install
pnpm --filter @travel/shared build
```

The shared package must be built once so type declarations are emitted for the server and web workspaces.

## Develop

Copy `.env.example` to `.env` and fill in `MOONSHOT_API_KEY`, `QWEATHER_KEY`, `AMAP_KEY`.

In two terminals:

```bash
pnpm --filter @travel/server dev
pnpm --filter @travel/web dev
```

Web runs on http://localhost:5173 with `/api` proxied to http://localhost:3001.

## Docker

```bash
docker compose up --build
```

Web is served by nginx on http://localhost:8080, with `/api` proxied to the server container. SSE streaming passes through unbuffered.
