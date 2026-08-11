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
};

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

export async function requestAI(
  request: AIRequest,
  settings: ProviderSettings,
): Promise<string> {
  const temperature = request.temperature ?? 0.7;

  if (request.provider === "openai") {
    if (!settings.openaiKey) throw new Error("Add an OpenAI API key in Settings.");
    const baseUrl = (settings.openaiUrl || "https://api.openai.com/v1").replace(/\/$/, "");
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.openaiKey}`,
      },
      body: JSON.stringify({
        model: request.model,
        temperature,
        messages: [
          ...(request.systemPrompt
            ? [{ role: "system", content: request.systemPrompt }]
            : []),
          { role: "user", content: request.prompt },
        ],
      }),
    });
    const data = await readJson(response, "OpenAI");
    return data.choices?.[0]?.message?.content ?? "";
  }

  if (request.provider === "gemini") {
    if (!settings.geminiKey) throw new Error("Add a Gemini API key in Settings.");
    const baseUrl = (settings.geminiUrl || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
    const url = `${baseUrl}/models/${encodeURIComponent(request.model)}:generateContent?key=${encodeURIComponent(settings.geminiKey)}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: request.systemPrompt
          ? { parts: [{ text: request.systemPrompt }] }
          : undefined,
        contents: [{ role: "user", parts: [{ text: request.prompt }] }],
        generationConfig: { temperature },
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
    const response = await fetch(`${baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": settings.claudeKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: request.model,
        max_tokens: 2048,
        temperature,
        system: request.systemPrompt || undefined,
        messages: [{ role: "user", content: request.prompt }],
      }),
    });
    const data = await readJson(response, "Claude");
    return data.content
      ?.filter((part: { type?: string }) => part.type === "text")
      .map((part: { text?: string }) => part.text ?? "")
      .join("\n") ?? "";
  }

  const baseUrl = (settings.ollamaUrl || "http://localhost:11434").replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: request.model,
      stream: false,
      options: { temperature },
      messages: [
        ...(request.systemPrompt
          ? [{ role: "system", content: request.systemPrompt }]
          : []),
        { role: "user", content: request.prompt },
      ],
    }),
  });
  const data = await readJson(response, "Ollama");
  return data.message?.content ?? "";
}
