import { ChatOpenAI } from "@langchain/openai";

const apiKey = process.env.MOONSHOT_API_KEY;
const model = process.env.MOONSHOT_MODEL ?? "kimi-k2.6";

if (!apiKey) {
  console.error("[ping-llm] MOONSHOT_API_KEY is missing");
  process.exit(1);
}

const llm = new ChatOpenAI({
  model,
  apiKey,
  modelKwargs: {
    thinking: { type: "disabled" },
  },
  configuration: { baseURL: "https://api.moonshot.cn/v1" },
});

async function main() {
  console.log(`[ping-llm] model=${model} baseURL=https://api.moonshot.cn/v1 (stream)`);
  const started = Date.now();
  try {
    const stream = await llm.stream([
      { role: "system", content: "你是一个连通性检查助手，请用数数回答。" },
      { role: "user", content: "数到8，每个数字占一行" },
    ]);
    let firstChunkMs: number | null = null;
    let chunks = 0;
    let text = "";
    const arrivals: number[] = [];
    for await (const chunk of stream) {
      const t = Date.now() - started;
      if (firstChunkMs === null) firstChunkMs = t;
      arrivals.push(t);
      chunks += 1;
      const piece =
        typeof chunk.content === "string" ? chunk.content : JSON.stringify(chunk.content);
      text += piece;
      console.log(`[ping-llm] chunk#${chunks} t=${t}ms len=${piece.length} ${JSON.stringify(piece)}`);
    }
    const ms = Date.now() - started;
    const gaps = arrivals.slice(1).map((t, i) => t - (arrivals[i] ?? t));
    const avgGap = gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : 0;
    console.log(
      `[ping-llm] ok total=${ms}ms ttfb=${firstChunkMs ?? -1}ms chunks=${chunks} avgGap=${avgGap}ms text=${JSON.stringify(text)}`,
    );
    process.exit(0);
  } catch (err) {
    const ms = Date.now() - started;
    console.error(`[ping-llm] failed (${ms}ms):`, err);
    process.exit(1);
  }
}

main();
