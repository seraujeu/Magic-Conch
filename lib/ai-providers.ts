export type AIProvider = "openai" | "gemini" | "claude" | "ollama";

export type ProviderSettings = {
  openaiKey?: string;
  openaiUrl?: string;
  geminiKey?: string;
  geminiUrl?: string;
  claudeKey?: string;
  claudeUrl?: string;
  ollamaUrl?: string;
};

export type AIRequest = {
  provider: AIProvider;
  model: string;
  systemPrompt?: string;
  prompt: string;
  temperature?: number;
  useModelDefaults?: boolean;
  files?: AIFile[];
  openai?: OpenAIRequestSettings;
  gemini?: GeminiRequestSettings;
  claude?: ClaudeRequestSettings;
  ollama?: OllamaRequestSettings;
};

export type OpenAIReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export type OpenAIRequestSettings = {
  reasoningEffort?: OpenAIReasoningEffort;
  verbosity?: "low" | "medium" | "high";
  maxCompletionTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  seed?: number;
  stop?: string[];
};

export type GeminiThinkingLevel = "minimal" | "low" | "medium" | "high";

export type GeminiRequestSettings = {
  thinkingLevel?: GeminiThinkingLevel;
  thinkingBudget?: number;
  maxOutputTokens?: number;
  topP?: number;
  topK?: number;
  seed?: number;
  stopSequences?: string[];
};

export type ClaudeThinkingMode = "adaptive" | "disabled" | "enabled";

export type ClaudeRequestSettings = {
  thinking?: ClaudeThinkingMode;
  thinkingBudget?: number;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  maxTokens?: number;
  topP?: number;
  topK?: number;
  stopSequences?: string[];
};

export type OllamaThink = boolean | "low" | "medium" | "high";

export type OllamaRequestSettings = {
  think?: OllamaThink;
  keepAlive?: string;
  numCtx?: number;
  numPredict?: number;
  topK?: number;
  topP?: number;
  minP?: number;
  seed?: number;
  repeatPenalty?: number;
  repeatLastN?: number;
  stop?: string[];
};

export type AIProgress = {
  content: string;
  thinking: string;
  done: boolean;
};

export type AIFile = {
  name: string;
  type: string;
  data: string;
};

type GeminiModel = {
  name?: string;
  supportedGenerationMethods?: string[];
};

function dataUrlBase64(data: string) {
  return data.slice(data.indexOf(",") + 1);
}

function imageFiles(files: AIFile[] = []) {
  return files.filter((file) => file.type.startsWith("image/"));
}

function apiError(provider: string, status: number, body: string) {
  let message = body;
  try {
    const parsed = JSON.parse(body);
    message = parsed.error?.message ?? parsed.message ?? body;
  } catch {
    // Keep the original response when an API returns plain text.
  }
  return new Error(`${provider} request failed (${status}): ${message}`);
}

async function readJson(response: Response, provider: string) {
  const body = await response.text();
  if (!response.ok) throw apiError(provider, response.status, body);
  return JSON.parse(body);
}

function uniqueModelIds(models: unknown[]) {
  return [...new Set(models.filter((model): model is string => typeof model === "string" && Boolean(model)))];
}

function definedObject(values: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
}

function rejectsOpenAIReasoningEffort(status: number, body: string) {
  return status === 400
    && /reasoning_effort/i.test(body)
    && /(unrecognized|unknown|unsupported|not permitted|extra inputs)/i.test(body);
}

async function readOllamaStream(
  response: Response,
  onProgress: (progress: AIProgress) => void,
) {
  if (!response.ok) {
    const body = await response.text();
    throw apiError("Ollama", response.status, body);
  }
  if (!response.body) throw new Error("Ollama returned an empty streaming response.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let thinking = "";

  const consumeLine = (line: string) => {
    if (!line.trim()) return;
    const chunk = JSON.parse(line);
    if (chunk.error) throw new Error(`Ollama request failed: ${chunk.error}`);
    content += chunk.message?.content ?? "";
    thinking += chunk.message?.thinking ?? "";
    onProgress({ content, thinking, done: Boolean(chunk.done) });
  };

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    lines.forEach(consumeLine);
    if (done) break;
  }
  consumeLine(buffer);
  onProgress({ content, thinking, done: true });
  return content;
}

export async function listAvailableModels(
  provider: AIProvider,
  settings: ProviderSettings,
): Promise<string[]> {
  if (provider === "openai") {
    if (!settings.openaiKey) throw new Error("Add an OpenAI API key in Settings.");
    const baseUrl = (settings.openaiUrl || "https://api.openai.com/v1").replace(/\/$/, "");
    const response = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${settings.openaiKey}` },
    });
    const data = await readJson(response, "OpenAI");
    return uniqueModelIds((data.data || []).map((model: { id?: string }) => model.id));
  }

  if (provider === "gemini") {
    if (!settings.geminiKey) throw new Error("Add a Gemini API key in Settings.");
    const baseUrl = (settings.geminiUrl || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
    const models: unknown[] = [];
    let pageToken = "";

    do {
      const query = new URLSearchParams({ key: settings.geminiKey, pageSize: "1000" });
      if (pageToken) query.set("pageToken", pageToken);
      const response = await fetch(`${baseUrl}/models?${query}`);
      const data = await readJson(response, "Gemini");
      models.push(...(data.models || [])
        .filter((model: GeminiModel) => model.supportedGenerationMethods?.includes("generateContent"))
        .map((model: GeminiModel) => model.name?.replace(/^models\//, "")));
      pageToken = data.nextPageToken || "";
    } while (pageToken);

    return uniqueModelIds(models);
  }

  if (provider === "claude") {
    if (!settings.claudeKey) throw new Error("Add an Anthropic API key in Settings.");
    const baseUrl = (settings.claudeUrl || "https://api.anthropic.com/v1").replace(/\/$/, "");
    const response = await fetch(`${baseUrl}/models?limit=1000`, {
      headers: {
        "x-api-key": settings.claudeKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
    });
    const data = await readJson(response, "Anthropic");
    return uniqueModelIds((data.data || []).map((model: { id?: string }) => model.id));
  }

  const baseUrl = (settings.ollamaUrl || "http://localhost:11434").replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/api/tags`);
  const data = await readJson(response, "Ollama");
  return uniqueModelIds((data.models || []).map((model: { name?: string }) => model.name));
}

export async function requestAI(
  request: AIRequest,
  settings: ProviderSettings,
  onProgress?: (progress: AIProgress) => void,
): Promise<string> {
  const temperature = request.useModelDefaults ? undefined : request.temperature ?? 0.7;

  if (request.provider === "openai") {
    if (!settings.openaiKey) throw new Error("Add an OpenAI API key in Settings.");
    const baseUrl = (settings.openaiUrl || "https://api.openai.com/v1").replace(/\/$/, "");
    const openai = request.openai || {};
    const url = `${baseUrl}/chat/completions`;
    const body = definedObject({
      model: request.model,
      temperature: openai.reasoningEffort && openai.reasoningEffort !== "none" ? undefined : temperature,
      reasoning_effort: openai.reasoningEffort,
      verbosity: openai.verbosity,
      max_completion_tokens: openai.maxCompletionTokens,
      top_p: openai.topP,
      frequency_penalty: openai.frequencyPenalty,
      presence_penalty: openai.presencePenalty,
      seed: openai.seed,
      stop: openai.stop?.length ? openai.stop : undefined,
      messages: [
        ...(request.systemPrompt
          ? [{ role: "system", content: request.systemPrompt }]
          : []),
        {
          role: "user",
          content: imageFiles(request.files).length
            ? [
                { type: "text", text: request.prompt },
                ...imageFiles(request.files).map((file) => ({ type: "image_url", image_url: { url: file.data } })),
              ]
            : request.prompt,
        },
      ],
    });
    const send = () => fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.openaiKey}`,
      },
      body: JSON.stringify(body),
    });
    let response = await send();
    if (!response.ok && "reasoning_effort" in body) {
      const errorBody = await response.text();
      if (!rejectsOpenAIReasoningEffort(response.status, errorBody)) throw apiError("OpenAI", response.status, errorBody);
      delete body.reasoning_effort;
      response = await send();
    }
    const data = await readJson(response, "OpenAI");
    return data.choices?.[0]?.message?.content ?? "";
  }

  if (request.provider === "gemini") {
    if (!settings.geminiKey) throw new Error("Add a Gemini API key in Settings.");
    const baseUrl = (settings.geminiUrl || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
    const url = `${baseUrl}/models/${encodeURIComponent(request.model)}:generateContent?key=${encodeURIComponent(settings.geminiKey)}`;
    const gemini = request.gemini || {};
    const thinkingConfig = definedObject({
      thinkingLevel: gemini.thinkingLevel,
      thinkingBudget: gemini.thinkingBudget,
    });
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: request.systemPrompt
          ? { parts: [{ text: request.systemPrompt }] }
          : undefined,
        contents: [{
          role: "user",
          parts: [
            { text: request.prompt },
            ...(request.files || [])
              .filter((file) => /^(?:image|audio|video)\//.test(file.type) || file.type === "application/pdf")
              .map((file) => ({ inlineData: { mimeType: file.type, data: dataUrlBase64(file.data) } })),
          ],
        }],
        generationConfig: definedObject({
          temperature,
          maxOutputTokens: gemini.maxOutputTokens,
          topP: gemini.topP,
          topK: gemini.topK,
          seed: gemini.seed,
          stopSequences: gemini.stopSequences?.length ? gemini.stopSequences : undefined,
          thinkingConfig: Object.keys(thinkingConfig).length ? thinkingConfig : undefined,
        }),
      }),
    });
    const data = await readJson(response, "Gemini");
    return data.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text ?? "")
      .join("") ?? "";
  }

  if (request.provider === "claude") {
    if (!settings.claudeKey) throw new Error("Add an Anthropic API key in Settings.");
    const baseUrl = (settings.claudeUrl || "https://api.anthropic.com/v1").replace(/\/$/, "");
    const claude = request.claude || {};
    const thinking = claude.thinking === "enabled"
      ? { type: "enabled", budget_tokens: claude.thinkingBudget ?? 1024 }
      : claude.thinking ? { type: claude.thinking } : undefined;
    const response = await fetch(`${baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": settings.claudeKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(definedObject({
        model: request.model,
        max_tokens: claude.maxTokens ?? 2048,
        temperature: claude.thinking || claude.effort ? undefined : temperature,
        top_p: claude.topP,
        top_k: claude.topK,
        stop_sequences: claude.stopSequences?.length ? claude.stopSequences : undefined,
        thinking,
        output_config: claude.effort ? { effort: claude.effort } : undefined,
        system: request.systemPrompt || undefined,
        messages: [{
          role: "user",
          content: imageFiles(request.files).length || request.files?.some((file) => file.type === "application/pdf")
            ? [
                { type: "text", text: request.prompt },
                ...imageFiles(request.files).map((file) => ({
                  type: "image",
                  source: { type: "base64", media_type: file.type, data: dataUrlBase64(file.data) },
                })),
                ...(request.files || []).filter((file) => file.type === "application/pdf").map((file) => ({
                  type: "document",
                  source: { type: "base64", media_type: file.type, data: dataUrlBase64(file.data) },
                })),
              ]
            : request.prompt,
        }],
      })),
    });
    const data = await readJson(response, "Claude");
    return data.content
      ?.filter((part: { type?: string }) => part.type === "text")
      .map((part: { text?: string }) => part.text ?? "")
      .join("\n") ?? "";
  }

  const baseUrl = (settings.ollamaUrl || "http://localhost:11434").replace(/\/$/, "");
  const ollama = request.ollama || {};
  const stream = Boolean(onProgress);
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: request.model,
      stream,
      think: ollama.think,
      keep_alive: ollama.keepAlive || undefined,
      options: definedObject({
        temperature,
        num_ctx: ollama.numCtx,
        num_predict: ollama.numPredict,
        top_k: ollama.topK,
        top_p: ollama.topP,
        min_p: ollama.minP,
        seed: ollama.seed,
        repeat_penalty: ollama.repeatPenalty,
        repeat_last_n: ollama.repeatLastN,
        stop: ollama.stop?.length ? ollama.stop : undefined,
      }),
      messages: [
        ...(request.systemPrompt
          ? [{ role: "system", content: request.systemPrompt }]
          : []),
        {
          role: "user",
          content: request.prompt,
          ...(imageFiles(request.files).length
            ? { images: imageFiles(request.files).map((file) => dataUrlBase64(file.data)) }
            : {}),
        },
      ],
    }),
  });
  if (onProgress) return readOllamaStream(response, onProgress);
  const data = await readJson(response, "Ollama");
  return data.message?.content ?? "";
}
