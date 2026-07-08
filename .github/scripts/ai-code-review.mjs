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

function parseJsonResponse(content) {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = fenced ? fenced[1].trim() : trimmed;
  return JSON.parse(jsonText);
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function renderList(items) {
  const list = toArray(items).filter(Boolean);
  if (list.length === 0) {
    return "无。";
  }
  return list.map((item, index) => `${index + 1}. ${String(item).trim()}`).join("\n");
}

function normalizeInlineComments(comments) {
  return toArray(comments)
    .map((comment) => ({
      path: typeof comment.path === "string" ? comment.path.trim() : "",
      line: Number.parseInt(comment.line, 10),
      severity: typeof comment.severity === "string" ? comment.severity.trim() : "low",
      title: typeof comment.title === "string" ? comment.title.trim() : "AI review",
      body: typeof comment.body === "string" ? comment.body.trim() : "",
    }))
    .filter((comment) => comment.path && Number.isInteger(comment.line) && comment.line > 0 && comment.body);
}

function renderMarkdown(review, inlineComments) {
  return `${MARKER}

## AI Code Review

### 总体结论

${review.summary || "未提供总体结论。"}

### 高风险问题

${renderList(review.high_risk)}

### 中风险问题

${renderList(review.medium_risk)}

### 低风险建议

${renderList(review.low_risk)}

### 行内评论

${inlineComments.length > 0 ? `已生成 ${inlineComments.length} 条行内评论。` : "无可定位到具体 diff 行的评论。"}

### 测试建议

${renderList(review.tests)}

### 合并建议

${review.merge_advice || "需要人工结合 CI 与业务上下文判断。"}
`;
}

function buildPrompt({ changedFiles, diff, truncated, language }) {
  return `你是资深代码审查助手。只审查本次 PR diff 中能被证实的问题。

项目背景：
- pnpm workspace, Node.js >= 24
- apps/web: React + Vite
- apps/server: Koa + TypeScript
- packages/shared: workspace shared package

审查要求：
- 输出语言：${language === "zh-CN" ? "中文" : language}。
- 优先找运行失败、类型错误、安全问题、状态/数据不一致、明显边界条件缺陷。
- 不要泛泛而谈，不要重复 diff，不确定就不要作为问题输出。
- inline_comments 最多 5 条，只评论最重要且能定位到 diff 新版本行号的问题。
- inline_comments.line 必须是 diff 中存在的右侧行号（+ 行或上下文行），不能是删除行或文件外行。
- 必须只输出合法 JSON，不能使用 Markdown，不能包裹代码块。

JSON 结构：
{
  "summary": "1-2 句话",
  "high_risk": [],
  "medium_risk": [],
  "low_risk": [],
  "tests": [],
  "merge_advice": "简短合并建议",
  "inline_comments": [
    {
      "path": "file path",
      "line": 123,
      "severity": "high|medium|low",
      "title": "短标题",
      "body": "具体问题和建议，80-180 字"
    }
  ]
}

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
  const inlineOutPath = getArg("--inline-out", "review-inline.json");

  const apiKey = requiredAnyEnv("AI_REVIEW_API_KEY", "MOONSHOT_API_KEY");
  const model = requiredAnyEnv("AI_REVIEW_MODEL", "MOONSHOT_MODEL");
  const baseUrl = firstEnv("AI_REVIEW_BASE_URL", "MOONSHOT_BASE_URL") || "https://api.moonshot.cn/v1";
  const chatCompletionsUrl = buildChatCompletionsUrl(baseUrl);
  const maxDiffChars = Number.parseInt(process.env.AI_REVIEW_MAX_DIFF_CHARS || "20000", 10);
  const maxOutputTokens = Number.parseInt(process.env.AI_REVIEW_MAX_OUTPUT_TOKENS || "6000", 10);
  const language = process.env.AI_REVIEW_LANGUAGE || "zh-CN";

  const [changedFiles, rawDiff] = await Promise.all([
    readFile(filesPath, "utf8"),
    readFile(diffPath, "utf8"),
  ]);

  const { text: diff, truncated } = truncate(rawDiff, Number.isFinite(maxDiffChars) ? maxDiffChars : 20000);
  console.log(`Changed files chars: ${changedFiles.length}`);
  console.log(`Raw diff chars: ${rawDiff.length}`);
  console.log(`Sent diff chars: ${diff.length}${truncated ? " (truncated)" : ""}`);
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
      max_tokens: Number.isFinite(maxOutputTokens) ? maxOutputTokens : 6000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI review request failed: ${response.status} ${response.statusText}\n${errorText}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content?.trim();
  if (!content) {
    const choice = data?.choices?.[0];
    throw new Error([
      "AI review response did not contain choices[0].message.content",
      choice?.finish_reason ? `finish_reason: ${choice.finish_reason}` : undefined,
      data?.usage ? `usage: ${JSON.stringify(data.usage)}` : undefined,
      choice?.message?.reasoning_content ? `reasoning_content_chars: ${choice.message.reasoning_content.length}` : undefined,
    ].filter(Boolean).join("\n"));
  }

  const review = parseJsonResponse(content);
  const inlineComments = normalizeInlineComments(review.inline_comments).slice(0, 5);

  await Promise.all([
    writeFile(outPath, renderMarkdown(review, inlineComments), "utf8"),
    writeFile(inlineOutPath, `${JSON.stringify(inlineComments, null, 2)}\n`, "utf8"),
  ]);
}

main().catch(async (error) => {
  const outPath = getArg("--out", "review.md");
  const inlineOutPath = getArg("--inline-out", "review-inline.json");
  const message = error instanceof Error
    ? [
        error.message,
        error.cause instanceof Error ? `cause: ${error.cause.message}` : undefined,
        error.cause?.code ? `cause code: ${error.cause.code}` : undefined,
      ].filter(Boolean).join("\n")
    : String(error);
  const fallback = `${MARKER}

## AI Code Review

AI CR 暂时未能生成，请检查 GitHub Actions 日志！

错误摘要：

\`\`\`text
${message.slice(0, 4000)}
\`\`\`
`;

  await Promise.all([
    writeFile(outPath, fallback, "utf8"),
    writeFile(inlineOutPath, "[]\n", "utf8"),
  ]);
  console.error(message);
  process.exitCode = 0;
});
