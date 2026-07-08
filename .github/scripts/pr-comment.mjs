import { readFile } from "node:fs/promises";
import process from "node:process";

const MARKER = "<!-- ai-code-review -->";

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

async function main() {
  const token = requiredEnv("GITHUB_TOKEN");
  const repository = requiredEnv("GITHUB_REPOSITORY");
  const eventPath = requiredEnv("GITHUB_EVENT_PATH");
  const reviewFile = process.env.REVIEW_FILE || "review.md";

  const event = JSON.parse(await readFile(eventPath, "utf8"));
  const issueNumber = event.pull_request?.number;
  if (!issueNumber) {
    throw new Error("This script must run in a pull_request event");
  }

  const reviewBody = await readFile(reviewFile, "utf8");
  const body = reviewBody.includes(MARKER) ? reviewBody : `${MARKER}\n\n${reviewBody}`;
  const [owner, repo] = repository.split("/");
  const commentsUrl = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`;

  const comments = await githubRequest(`${commentsUrl}?per_page=100`, { token });
  const previous = comments.find((comment) => comment.user?.type === "Bot" && comment.body?.includes(MARKER));

  if (previous) {
    await githubRequest(previous.url, {
      method: "PATCH",
      token,
      body: { body },
    });
    console.log(`Updated AI review comment #${previous.id}`);
    return;
  }

  const created = await githubRequest(commentsUrl, {
    method: "POST",
    token,
    body: { body },
  });
  console.log(`Created AI review comment #${created.id}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
