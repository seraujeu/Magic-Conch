export type PluginField = {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "select";
  default?: string | number;
  options?: string[];
};

export type PluginFileAsset = {
  name: string;
  type: string;
  data: string;
  size: number;
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
    | { kind: "template"; template?: string; file?: string }
    | { kind: "http"; url: string; method?: "GET" | "POST" }
    | { kind: "javascript"; code?: string; file?: string };
};

export type MagicConchPlugin = {
  id: string;
  name: string;
  version: string;
  description?: string;
  nodes: PluginNodeDefinition[];
  files?: PluginFileAsset[];
};

export function validatePlugin(value: unknown): MagicConchPlugin {
  const plugin = value as Partial<MagicConchPlugin>;
  if (!plugin?.id || !plugin.name || !plugin.version || !Array.isArray(plugin.nodes)) {
    throw new Error("The plug-in manifest is missing an id, name, version, or nodes array.");
  }
  if (plugin.files !== undefined && !Array.isArray(plugin.files)) {
    throw new Error("The plug-in files field must be an array.");
  }
  for (const file of plugin.files || []) {
    if (!file.name || !file.data) throw new Error("Every bundled plug-in file needs a name and data.");
  }
  for (const node of plugin.nodes) {
    if (!node.type || !node.label || !node.executor?.kind) {
      throw new Error("Every plug-in node needs a type, label, and executor.");
    }
    if (!node.type.startsWith(`${plugin.id}:`)) {
      throw new Error(`Plug-in node types must start with “${plugin.id}:”.`);
    }
    if (node.executor.kind === "template" && !node.executor.template && !node.executor.file) {
      throw new Error(`Plug-in node “${node.label}” needs a template or bundled template file.`);
    }
    if (node.executor.kind === "javascript" && !node.executor.code && !node.executor.file) {
      throw new Error(`Plug-in node “${node.label}” needs JavaScript code or a bundled JavaScript file.`);
    }
    if ((node.executor.kind === "javascript" || node.executor.kind === "template")
      && node.executor.file && !bundledFile(plugin.files || [], node.executor.file)) {
      throw new Error(`The plug-in file “${node.executor.file}” is missing.`);
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

function normalizeFileName(value: string) {
  return value.replace(/\\/g, "/").replace(/^\.?\/?files\//i, "").replace(/^\/+/, "");
}

function bundledFile(files: PluginFileAsset[], reference: string) {
  const wanted = normalizeFileName(reference).toLocaleLowerCase();
  return files.find((file) => normalizeFileName(file.name).toLocaleLowerCase() === wanted);
}

function bundledFileText(files: PluginFileAsset[], reference: string) {
  const file = bundledFile(files, reference);
  if (!file) throw new Error(`The plug-in file “${reference}” is missing.`);
  const match = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(file.data);
  if (!match) throw new Error(`The plug-in file “${reference}” has invalid data.`);
  if (!match[2]) return decodeURIComponent(match[3]);
  const binary = atob(match[3]);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export async function executePluginNode(
  definition: PluginNodeDefinition,
  inputs: Record<string, unknown>,
  config: Record<string, unknown>,
  context: Record<string, unknown>,
  files: PluginFileAsset[] = [],
): Promise<unknown> {
  const executor = definition.executor;
  const input = inputs.prompt ?? inputs.text ?? inputs.input ?? Object.values(inputs)[0] ?? "";
  if (executor.kind === "template") {
    const template = executor.template ?? bundledFileText(files, executor.file!);
    return interpolate(template, { input, inputs, config, context, files });
  }

  if (executor.kind === "http") {
    const url = interpolate(executor.url, { input, config, context });
    const response = await fetch(url, {
      method: executor.method || "POST",
      headers: { "Content-Type": "application/json" },
      body:
        (executor.method || "POST") === "GET"
          ? undefined
          : JSON.stringify({ input, inputs, config, context, files }),
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
  const code = executor.code ?? bundledFileText(files, executor.file!);
  const run = new AsyncFunction("input", "inputs", "config", "context", "files", code);
  return run(input, inputs, config, context, files);
}
