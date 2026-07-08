import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";

const MARKER = "<!-- ai-code-review -->";

function getArg(name, fallback = undefined) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function firstEnv(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value) {
      return value;
    }
  }
  return undefined;
}

function requiredAnyEnv(...names) {
  const value = firstEnv(...names);
  if (!value) {
    throw new Error(`${names.join(" or ")} is required`);
  }
  return value;
}

function buildChatCompletionsUrl(rawUrl) {
  const url = new URL(rawUrl);
  const pathname = url.pathname.replace(/\/+$/, "");

  if (pathname.endsWith("/chat/completions")) {
    url.pathname = pathname;
    return url.toString();
  }

  if (pathname.endsWith("/v1")) {
    url.pathname = `${pathname}/chat/completions`;
    return url.toString();
  }

  if (url.hostname === "api.moonshot.cn") {
    url.pathname = `${pathname}/v1/chat/completions`.replace(/\/+/g, "/");
    return url.toString();
  }

  url.pathname = `${pathname}/chat/completions`.replace(/\/+/g, "/");
  return url.toString();
}

function truncate(value, maxChars) {
  if (value.length <= maxChars) {
    return { text: value, truncated: false };
  }
  return {
    text: value.slice(0, maxChars),
    truncated: true,
  };
}

function buildPrompt({ changedFiles, diff, truncated, language }) {
  return `你是一个资深代码审查助手。请只基于本次 PR 的变更文件列表和 diff 做审查，不要臆测 diff 中无法证明的问题。

项目背景：
- Monorepo: pnpm workspace
- Node.js >= 24, pnpm 10
- 前端: apps/web, React + Vite
- 后端: apps/server, Koa + TypeScript
- 共享包: packages/shared
- 数据层: SQLite + Drizzle
- 部署相关: Dockerfile.server, Dockerfile.web, docker-compose.yml

审查要求：
- 使用 ${language === "zh-CN" ? "中文" : language} 输出。
- 优先指出会导致运行失败、类型错误、状态错乱、安全风险、数据一致性问题的缺陷。
- 明确区分“必须修复”和“建议优化”。
- 如果没有发现明确问题，请直接说明。
- 不要输出泛泛的最佳实践。
- 不要重复粘贴大段 diff。
- 如果信息不足，请标注“需要人工确认”。

输出格式必须是：
${MARKER}

## AI Code Review

### 总体结论

### 高风险问题

### 中风险问题

### 低风险建议

### 测试建议

### 合并建议

变更文件列表：
\`\`\`text
${changedFiles.trim() || "(no changed files)"}
\`\`\`

Diff${truncated ? "（已因长度限制截断，可能未覆盖全部变更）" : ""}：
\`\`\`diff
${diff.trim() || "(no diff after filtering sensitive or ignored files)"}
\`\`\``;
}

async function main() {
  const filesPath = getArg("--files", "changed-files.txt");
  const diffPath = getArg("--diff", "pr.diff");
  const outPath = getArg("--out", "review.md");

  const apiKey = requiredAnyEnv("AI_REVIEW_API_KEY", "MOONSHOT_API_KEY");
  const model = requiredAnyEnv("AI_REVIEW_MODEL", "MOONSHOT_MODEL");
  const baseUrl = firstEnv("AI_REVIEW_BASE_URL", "MOONSHOT_BASE_URL") || "https://api.moonshot.cn/v1";
  const chatCompletionsUrl = buildChatCompletionsUrl(baseUrl);
  const maxDiffChars = Number.parseInt(process.env.AI_REVIEW_MAX_DIFF_CHARS || "100000", 10);
  const language = process.env.AI_REVIEW_LANGUAGE || "zh-CN";

  const [changedFiles, rawDiff] = await Promise.all([
    readFile(filesPath, "utf8"),
    readFile(diffPath, "utf8"),
  ]);

  const { text: diff, truncated } = truncate(rawDiff, Number.isFinite(maxDiffChars) ? maxDiffChars : 100000);
  const prompt = buildPrompt({ changedFiles, diff, truncated, language });

  const response = await fetch(chatCompletionsUrl, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: "你是严谨、具体、重视证据的代码审查助手。",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI review request failed: ${response.status} ${response.statusText}\n${errorText}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("AI review response did not contain choices[0].message.content");
  }

  const body = content.includes(MARKER) ? content : `${MARKER}\n\n${content}`;
  await writeFile(outPath, `${body}\n`, "utf8");
}

main().catch(async (error) => {
  const outPath = getArg("--out", "review.md");
  const message = error instanceof Error ? error.message : String(error);
  const fallback = `${MARKER}

## AI Code Review

AI CR 暂时未能生成，请检查 GitHub Actions 日志！

错误摘要：

\`\`\`text
${message.slice(0, 4000)}
\`\`\`
`;

  await writeFile(outPath, fallback, "utf8");
  console.error(message);
  process.exitCode = 0;
});
