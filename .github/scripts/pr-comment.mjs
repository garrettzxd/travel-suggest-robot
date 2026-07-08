import { readFile } from "node:fs/promises";
import process from "node:process";

const MARKER = "<!-- ai-code-review -->";
const INLINE_MARKER = "<!-- ai-code-review-inline -->";

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

async function githubRequest(url, { method = "GET", token, body } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      "accept": "application/vnd.github+json",
      "authorization": `Bearer ${token}`,
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API request failed: ${method} ${url} -> ${response.status} ${response.statusText}\n${text}`);
  }

  if (response.status === 204) {
    return undefined;
  }

  return response.json();
}

function parseDiffRightLines(diff) {
  const files = new Map();
  let currentFile = "";
  let rightLine = 0;

  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ b/")) {
      currentFile = line.slice("+++ b/".length);
      if (!files.has(currentFile)) {
        files.set(currentFile, new Set());
      }
      continue;
    }

    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      rightLine = Number.parseInt(hunk[1], 10);
      continue;
    }

    if (!currentFile || !rightLine) {
      continue;
    }

    if (line.startsWith("+") && !line.startsWith("+++")) {
      files.get(currentFile).add(rightLine);
      rightLine += 1;
      continue;
    }

    if (line.startsWith(" ")) {
      files.get(currentFile).add(rightLine);
      rightLine += 1;
      continue;
    }

    if (line.startsWith("-") && !line.startsWith("---")) {
      continue;
    }
  }

  return files;
}

function formatInlineComment(comment) {
  const severity = comment.severity ? `**${comment.severity}**` : "**AI**";
  const title = comment.title ? ` ${comment.title}\n\n` : "\n\n";
  return `${INLINE_MARKER}\n${severity}:${title}${comment.body}`;
}

function normalizeInlineComments(comments, diffRightLines) {
  if (!Array.isArray(comments)) {
    return [];
  }

  return comments
    .map((comment) => ({
      path: typeof comment.path === "string" ? comment.path.trim() : "",
      line: Number.parseInt(comment.line, 10),
      severity: typeof comment.severity === "string" ? comment.severity.trim() : "low",
      title: typeof comment.title === "string" ? comment.title.trim() : "",
      body: typeof comment.body === "string" ? comment.body.trim() : "",
    }))
    .filter((comment) => {
      const validLines = diffRightLines.get(comment.path);
      return comment.path && Number.isInteger(comment.line) && comment.body && validLines?.has(comment.line);
    })
    .slice(0, 10);
}

async function main() {
  const token = requiredEnv("GITHUB_TOKEN");
  const repository = requiredEnv("GITHUB_REPOSITORY");
  const eventPath = requiredEnv("GITHUB_EVENT_PATH");
  const reviewFile = process.env.REVIEW_FILE || "review.md";
  const inlineReviewFile = process.env.INLINE_REVIEW_FILE || "review-inline.json";
  const diffFile = process.env.DIFF_FILE || "pr.diff";

  const event = JSON.parse(await readFile(eventPath, "utf8"));
  const issueNumber = event.pull_request?.number;
  if (!issueNumber) {
    throw new Error("This script must run in a pull_request event");
  }

  const reviewBody = await readFile(reviewFile, "utf8");
  const body = reviewBody.includes(MARKER) ? reviewBody : `${MARKER}\n\n${reviewBody}`;
  const [owner, repo] = repository.split("/");
  const commentsUrl = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`;
  const reviewCommentsUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${issueNumber}/comments`;
  const reviewsUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${issueNumber}/reviews`;

  const comments = await githubRequest(`${commentsUrl}?per_page=100`, { token });
  const previous = comments.find((comment) => comment.user?.type === "Bot" && comment.body?.includes(MARKER));

  if (previous) {
    await githubRequest(previous.url, {
      method: "PATCH",
      token,
      body: { body },
    });
    console.log(`Updated AI review comment #${previous.id}`);
  } else {
    const created = await githubRequest(commentsUrl, {
      method: "POST",
      token,
      body: { body },
    });
    console.log(`Created AI review comment #${created.id}`);
  }

  const [inlineReviewText, diffText] = await Promise.all([
    readFile(inlineReviewFile, "utf8").catch(() => "[]"),
    readFile(diffFile, "utf8").catch(() => ""),
  ]);
  const diffRightLines = parseDiffRightLines(diffText);
  const inlineComments = normalizeInlineComments(JSON.parse(inlineReviewText), diffRightLines);

  const previousInlineComments = await githubRequest(`${reviewCommentsUrl}?per_page=100`, { token });
  await Promise.all(
    previousInlineComments
      .filter((comment) => comment.user?.type === "Bot" && comment.body?.includes(INLINE_MARKER))
      .map((comment) => githubRequest(comment.url, { method: "DELETE", token })),
  );

  if (inlineComments.length === 0) {
    console.log("No valid inline AI review comments to publish");
    return;
  }

  await githubRequest(reviewsUrl, {
    method: "POST",
    token,
    body: {
      event: "COMMENT",
      body: `${MARKER}\n\nAI Code Review 行内评论`,
      comments: inlineComments.map((comment) => ({
        path: comment.path,
        line: comment.line,
        side: "RIGHT",
        body: formatInlineComment(comment),
      })),
    },
  });
  console.log(`Published ${inlineComments.length} inline AI review comments`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
