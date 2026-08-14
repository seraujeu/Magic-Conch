import assert from "node:assert/strict";
import test from "node:test";

import { listAvailableModels, requestAI } from "../lib/ai-providers.ts";

test("loads model options from OpenAI", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, init) => {
    request = { url: String(url), init };
    return new Response(JSON.stringify({ data: [{ id: "gpt-b" }, { id: "gpt-a" }] }), { status: 200 });
  };
  try {
    assert.deepEqual(await listAvailableModels("openai", { openaiKey: "test-key", openaiUrl: "https://openai.test/v1/" }), ["gpt-b", "gpt-a"]);
    assert.equal(request.url, "https://openai.test/v1/models");
    assert.equal(request.init.headers.Authorization, "Bearer test-key");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("loads all Gemini generateContent model pages and strips resource prefixes", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url) => {
    requests.push(String(url));
    return new Response(JSON.stringify(requests.length === 1 ? {
      models: [
        { name: "models/gemini-flash", supportedGenerationMethods: ["generateContent"] },
        { name: "models/gemini-embed", supportedGenerationMethods: ["embedContent"] },
      ],
      nextPageToken: "next page",
    } : {
      models: [{ name: "models/gemini-pro", supportedGenerationMethods: ["generateContent"] }],
    }), { status: 200 });
  };
  try {
    assert.deepEqual(await listAvailableModels("gemini", { geminiKey: "test-key" }), ["gemini-flash", "gemini-pro"]);
    assert.match(requests[0], /pageSize=1000/);
    assert.match(requests[1], /pageToken=next\+page/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("loads model options from Anthropic with browser API headers", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, init) => {
    request = { url: String(url), init };
    return new Response(JSON.stringify({ data: [{ id: "claude-new" }] }), { status: 200 });
  };
  try {
    assert.deepEqual(await listAvailableModels("claude", { claudeKey: "test-key" }), ["claude-new"]);
    assert.equal(request.url, "https://api.anthropic.com/v1/models?limit=1000");
    assert.equal(request.init.headers["x-api-key"], "test-key");
    assert.equal(request.init.headers["anthropic-dangerous-direct-browser-access"], "true");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("loads installed Ollama model options", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ models: [{ name: "gemma3" }] }), { status: 200 });
  try {
    assert.deepEqual(await listAvailableModels("ollama", { ollamaUrl: "http://ollama.test/" }), ["gemma3"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("passes OpenAI reasoning and generation settings in Chat Completions fields", async () => {
  const originalFetch = globalThis.fetch;
  let body;
  globalThis.fetch = async (_url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: "configured" } }] }), { status: 200 });
  };
  try {
    await requestAI({
      provider: "openai",
      model: "reasoning-model",
      prompt: "Test settings.",
      temperature: 0.25,
      openai: {
        reasoningEffort: "high",
        verbosity: "low",
        maxCompletionTokens: 4096,
        topP: 0.8,
        frequencyPenalty: 0.2,
        presencePenalty: -0.1,
        seed: 42,
        stop: ["END"],
      },
    }, { openaiKey: "test-key" });

    assert.equal(body.reasoning_effort, "high");
    assert.equal(body.verbosity, "low");
    assert.equal(body.max_completion_tokens, 4096);
    assert.equal(body.top_p, 0.8);
    assert.equal(body.frequency_penalty, 0.2);
    assert.equal(body.presence_penalty, -0.1);
    assert.equal(body.seed, 42);
    assert.deepEqual(body.stop, ["END"]);
    assert.equal("temperature" in body, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("passes Gemini thinking and generation settings in generationConfig", async () => {
  const originalFetch = globalThis.fetch;
  let body;
  globalThis.fetch = async (_url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "configured" }] } }] }), { status: 200 });
  };
  try {
    await requestAI({
      provider: "gemini",
      model: "gemini-model",
      prompt: "Test settings.",
      temperature: 0.4,
      gemini: {
        thinkingLevel: "high",
        maxOutputTokens: 8192,
        topP: 0.85,
        topK: 20,
        seed: 7,
        stopSequences: ["END", "STOP"],
      },
    }, { geminiKey: "test-key" });

    assert.deepEqual(body.generationConfig, {
      temperature: 0.4,
      maxOutputTokens: 8192,
      topP: 0.85,
      topK: 20,
      seed: 7,
      stopSequences: ["END", "STOP"],
      thinkingConfig: { thinkingLevel: "high" },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("passes Anthropic adaptive thinking, effort, and generation settings", async () => {
  const originalFetch = globalThis.fetch;
  let body;
  globalThis.fetch = async (_url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ content: [{ type: "text", text: "configured" }] }), { status: 200 });
  };
  try {
    await requestAI({
      provider: "claude",
      model: "claude-model",
      prompt: "Test settings.",
      temperature: 0.3,
      claude: {
        thinking: "adaptive",
        effort: "medium",
        maxTokens: 12000,
        topP: 0.9,
        topK: 30,
        stopSequences: ["END"],
      },
    }, { claudeKey: "test-key" });

    assert.equal(body.max_tokens, 12000);
    assert.deepEqual(body.thinking, { type: "adaptive" });
    assert.deepEqual(body.output_config, { effort: "medium" });
    assert.equal(body.top_p, 0.9);
    assert.equal(body.top_k, 30);
    assert.deepEqual(body.stop_sequences, ["END"]);
    assert.equal("temperature" in body, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("passes Anthropic legacy thinking budgets for compatible models", async () => {
  const originalFetch = globalThis.fetch;
  let body;
  globalThis.fetch = async (_url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ content: [{ type: "text", text: "configured" }] }), { status: 200 });
  };
  try {
    await requestAI({
      provider: "claude",
      model: "claude-legacy-model",
      prompt: "Test settings.",
      claude: { thinking: "enabled", thinkingBudget: 4096, maxTokens: 8192 },
    }, { claudeKey: "test-key" });

    assert.deepEqual(body.thinking, { type: "enabled", budget_tokens: 4096 });
    assert.equal(body.max_tokens, 8192);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("passes images to Ollama's multimodal message payload", async () => {
  const originalFetch = globalThis.fetch;
  let body;
  globalThis.fetch = async (_url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ message: { content: "seen" } }), { status: 200 });
  };
  try {
    const result = await requestAI({
      provider: "ollama",
      model: "gemma3",
      prompt: "Describe the attachment.",
      files: [{ name: "photo.png", type: "image/png", data: "data:image/png;base64,AQID" }],
    }, { ollamaUrl: "http://localhost:11434" });

    assert.equal(result, "seen");
    assert.equal(body.messages.at(-1).content, "Describe the attachment.");
    assert.deepEqual(body.messages.at(-1).images, ["AQID"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("passes advanced Ollama generation settings in their native API fields", async () => {
  const originalFetch = globalThis.fetch;
  let body;
  globalThis.fetch = async (_url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ message: { content: "configured" } }), { status: 200 });
  };
  try {
    await requestAI({
      provider: "ollama",
      model: "qwen3",
      prompt: "Test settings.",
      temperature: 0.25,
      ollama: {
        think: "high",
        keepAlive: "10m",
        numCtx: 8192,
        numPredict: 512,
        topK: 20,
        topP: 0.8,
        minP: 0.05,
        seed: 42,
        repeatPenalty: 1.15,
        repeatLastN: 128,
        stop: ["END", "STOP"],
      },
    }, { ollamaUrl: "http://localhost:11434" });

    assert.equal(body.stream, false);
    assert.equal(body.think, "high");
    assert.equal(body.keep_alive, "10m");
    assert.deepEqual(body.options, {
      temperature: 0.25,
      num_ctx: 8192,
      num_predict: 512,
      top_k: 20,
      top_p: 0.8,
      min_p: 0.05,
      seed: 42,
      repeat_penalty: 1.15,
      repeat_last_n: 128,
      stop: ["END", "STOP"],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("streams Ollama thinking separately from the answer", async () => {
  const originalFetch = globalThis.fetch;
  let body;
  globalThis.fetch = async (_url, init) => {
    body = JSON.parse(init.body);
    const chunks = [
      JSON.stringify({ message: { thinking: "Check " }, done: false }),
      JSON.stringify({ message: { thinking: "facts." }, done: false }),
      JSON.stringify({ message: { content: "Final " }, done: false }),
      JSON.stringify({ message: { content: "answer." }, done: true }),
    ].join("\n");
    return new Response(chunks, { status: 200, headers: { "Content-Type": "application/x-ndjson" } });
  };
  const updates = [];
  try {
    const result = await requestAI({
      provider: "ollama",
      model: "qwen3",
      prompt: "Think about this.",
    }, { ollamaUrl: "http://localhost:11434" }, (progress) => updates.push(progress));

    assert.equal(body.stream, true);
    assert.equal(result, "Final answer.");
    assert.ok(updates.some((update) => update.thinking === "Check facts." && update.content === ""));
    assert.deepEqual(updates.at(-1), { thinking: "Check facts.", content: "Final answer.", done: true });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("uses OpenAI image content blocks while retaining the text prompt", async () => {
  const originalFetch = globalThis.fetch;
  let body;
  globalThis.fetch = async (_url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: "seen" } }] }), { status: 200 });
  };
  try {
    await requestAI({
      provider: "openai",
      model: "vision-model",
      prompt: "Describe it.",
      files: [{ name: "photo.png", type: "image/png", data: "data:image/png;base64,AQID" }],
    }, { openaiKey: "test-key", openaiUrl: "https://example.test/v1" });

    assert.deepEqual(body.messages.at(-1).content, [
      { type: "text", text: "Describe it." },
      { type: "image_url", image_url: { url: "data:image/png;base64,AQID" } },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
