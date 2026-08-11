export type PluginField = {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "select";
  default?: string | number;
  options?: string[];
};

export type PluginNodeDefinition = {
  type: string;
  label: string;
  subtitle?: string;
  color?: string;
  fields?: PluginField[];
  category?: string;
  inputTypes?: {
    required?: Record<string, { type: string; label?: string; multiple?: boolean }>;
    optional?: Record<string, { type: string; label?: string; multiple?: boolean }>;
  };
  returnTypes?: string[];
  returnNames?: string[];
  functionName?: string;
  executor:
    | { kind: "template"; template: string }
    | { kind: "http"; url: string; method?: "GET" | "POST" }
    | { kind: "javascript"; code: string };
};

export type MagicConchPlugin = {
  id: string;
  name: string;
  version: string;
  description?: string;
  nodes: PluginNodeDefinition[];
};

export function validatePlugin(value: unknown): MagicConchPlugin {
  const plugin = value as Partial<MagicConchPlugin>;
  if (!plugin?.id || !plugin.name || !plugin.version || !Array.isArray(plugin.nodes)) {
    throw new Error("The plug-in manifest is missing an id, name, version, or nodes array.");
  }
  for (const node of plugin.nodes) {
    if (!node.type || !node.label || !node.executor?.kind) {
      throw new Error("Every plug-in node needs a type, label, and executor.");
    }
    if (!node.type.startsWith(`${plugin.id}:`)) {
      throw new Error(`Plug-in node types must start with “${plugin.id}:”.`);
    }
  }
  return plugin as MagicConchPlugin;
}

function interpolate(template: string, values: Record<string, unknown>) {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, path: string) => {
    const value = path.split(".").reduce<unknown>((current, key) => {
      if (current && typeof current === "object") return (current as Record<string, unknown>)[key];
      return undefined;
    }, values);
    return value == null ? "" : String(value);
  });
}

export async function executePluginNode(
  definition: PluginNodeDefinition,
  inputs: Record<string, unknown>,
  config: Record<string, unknown>,
  context: Record<string, unknown>,
): Promise<unknown> {
  const executor = definition.executor;
  const input = inputs.prompt ?? inputs.text ?? inputs.input ?? Object.values(inputs)[0] ?? "";
  if (executor.kind === "template") {
    return interpolate(executor.template, { input, inputs, config, context });
  }

  if (executor.kind === "http") {
    const url = interpolate(executor.url, { input, config, context });
    const response = await fetch(url, {
      method: executor.method || "POST",
      headers: { "Content-Type": "application/json" },
      body:
        (executor.method || "POST") === "GET"
          ? undefined
          : JSON.stringify({ input, inputs, config, context }),
    });
    if (!response.ok) throw new Error(`Plug-in request failed (${response.status}).`);
    const contentType = response.headers.get("content-type") || "";
    const value = contentType.includes("application/json")
      ? await response.json()
      : await response.text();
    return value;
  }

  // Plug-ins are local, explicitly installed, and run with the same access as the app.
  // AsyncFunction keeps the authoring format small while supporting custom operations.
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
    ...args: string[]
  ) => (...values: unknown[]) => Promise<unknown>;
  const run = new AsyncFunction("input", "inputs", "config", "context", executor.code);
  return run(input, inputs, config, context);
}
