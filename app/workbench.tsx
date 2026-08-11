"use client";

import {
  BrainCircuit,
  Braces,
  Bug,
  Box,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleStop,
  Clock3,
  Cloud,
  Code2,
  Combine,
  Copy,
  Database,
  Download,
  FileJson,
  FolderOpen,
  GitBranch,
  HardDrive,
  Info,
  KeyRound,
  LoaderCircle,
  Menu,
  MessageCircleQuestion,
  MessageSquare,
  MoreHorizontal,
  MousePointer2,
  PanelRightClose,
  PanelRightOpen,
  Paperclip,
  Pencil,
  Pin,
  Play,
  Plug,
  Plus,
  RefreshCw,
  Repeat2,
  Redo2,
  RotateCcw,
  Route,
  Shuffle,
  Save,
  Send,
  Settings,
  Sparkles,
  Trash2,
  Upload,
  Variable,
  Undo2,
  Workflow as WorkflowIcon,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  ChangeEvent,
  DragEvent as ReactDragEvent,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AIProvider, ProviderSettings, requestAI } from "../lib/ai-providers";
import {
  BranchableMessage,
  MessageBranch,
  replaceWithResentBranch,
  switchResentBranch,
} from "../lib/chat-branches";
import {
  executePluginNode,
  MagicConchPlugin,
  PluginNodeDefinition,
  validatePlugin,
} from "../lib/plugin-system";
import {
  expandWorkflowSyntax,
  expandWorkflowSyntaxInValue,
  WORKFLOW_SYNTAX,
  WorkflowSyntaxContext,
} from "../lib/workflow-syntax";

type BuiltinNodeType = "start" | "input" | "request" | "save" | "load" | "set-state" | "transform" | "loop" | "retry" | "wait" | "code" | "parser" | "join" | "parallel" | "router-condition" | "router-ai" | "router-rule" | "end";
type NodeType = string;
type FileAsset = { name: string; type: string; data: string; size: number };
type PortDataType = "prompt" | "files" | "document" | "text" | "number" | "boolean" | "any";
type PortSpec = { id: string; label: string; type: PortDataType; multiple?: boolean };
type NodeSchema = { inputs: PortSpec[]; outputs: PortSpec[] };
type RouteOption = { id: string; label: string; value?: string };
type WorkflowContext = {
  userMessage: string;
  additionalInput?: string;
  loadedData?: string;
  lastOutput?: string;
  files: FileAsset[];
  values: Record<string, unknown>;
  syntax: WorkflowSyntaxContext;
};
type FlowNode = {
  id: string;
  type: NodeType;
  name: string;
  x: number;
  y: number;
  config: {
    prompt?: string;
    agentName?: string;
    startMessage?: string;
    provider?: AIProvider;
    model?: string;
    systemPrompt?: string;
    temperature?: number;
    key?: string;
    collision?: "overwrite" | "timestamp" | "increment";
    loadMode?: "latest" | "all" | "exact";
    directoryName?: string;
    subfolder?: string;
    saveFiles?: "data" | "files" | "both";
    outputFileName?: string;
    pluginConfig?: Record<string, string | number>;
    routeMethod?: "contains" | "not_contains" | "equals" | "starts_with" | "ends_with" | "regex" | "length_gt" | "length_lt" | "is_empty" | "file_type" | "file_count_gt" | "number_gt" | "number_lt";
    routeValue?: string;
    caseSensitive?: boolean;
    routeCriteria?: string;
    routeALabel?: string;
    routeBLabel?: string;
    routeOptions?: RouteOption[];
    variableName?: string;
    stateValue?: string;
    valueType?: "text" | "number" | "boolean" | "json";
    transformOperation?: "json_parse" | "extract" | "template" | "regex" | "map" | "filter";
    path?: string;
    template?: string;
    pattern?: string;
    replacement?: string;
    parserFormat?: "auto" | "json" | "xml" | "csv" | "yaml" | "markdown";
    codeLanguage?: "javascript" | "python";
    code?: string;
    delayMs?: number;
    maxAttempts?: number;
    retryParameters?: string;
    aggregateOperation?: "array" | "object" | "concat" | "sum";
    conditionKind?: "truthy" | "equals" | "contains" | "input_type" | "file_extension";
    conditionValue?: string;
  };
};
type FlowEdge = { id: string; from: string; fromPort?: string; to: string; toPort?: string; dataType?: PortDataType | "flow" };
type Workflow = {
  id: string;
  name: string;
  description: string;
  version: number;
  updatedAt: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  files?: FileAsset[];
};
type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  time: string;
  meta?: string;
  files?: FileAsset[];
  branch?: MessageBranch<Message>;
};
type PendingWorkflowInput = {
  nodeId: string;
  context: WorkflowContext;
  runState: WorkflowRunState;
};
type WorkflowRunState = {
  completedNodeIds: string[];
  skippedNodeIds: string[];
  emittedPortKeys: string[];
  endResults: { text: string; files: FileAsset[] }[];
};
type ChatSnapshot = { messages: Message[]; pendingInput: PendingWorkflowInput | null };
type ChatSession = {
  id: string;
  title: string;
  messages: Message[];
  workflowId: string;
  folderId?: string | null;
  pinned: boolean;
  updatedAt: string;
  sessionNumber: number;
};
type ChatFolder = {
  id: string;
  name: string;
  collapsed: boolean;
  createdAt: string;
};
type DebugDatum = {
  port: string;
  label: string;
  type: PortDataType;
  value: unknown;
};
type DebugEvent = {
  id: string;
  nodeId: string;
  nodeName: string;
  nodeType: string;
  status: "running" | "waiting" | "completed" | "routed" | "error";
  detail: string;
  time: string;
  inputs: DebugDatum[];
  outputs: DebugDatum[];
};

type DirectoryHandle = {
  name: string;
  getDirectoryHandle: (name: string, options?: { create?: boolean }) => Promise<DirectoryHandle>;
  getFileHandle: (
    name: string,
    options?: { create?: boolean },
  ) => Promise<{
    createWritable: () => Promise<{ write: (data: string | Blob) => Promise<void>; close: () => Promise<void> }>;
    getFile: () => Promise<File>;
  }>;
  values: () => AsyncIterableIterator<{
    kind: "file" | "directory";
    name: string;
    getFile?: () => Promise<File>;
  }>;
};

const NODE_META: Record<
  BuiltinNodeType,
  { label: string; subtitle: string; color: string; icon: typeof Play }
> = {
  start: { label: "Start", subtitle: "Entry point", color: "#27a36a", icon: Play },
  input: { label: "Message", subtitle: "Prompt and file output", color: "#7c63e8", icon: MessageCircleQuestion },
  request: { label: "Request", subtitle: "Call an AI model", color: "#e17444", icon: Cloud },
  save: { label: "Save", subtitle: "Write a file", color: "#3188c7", icon: Save },
  load: { label: "Load", subtitle: "Read a file", color: "#c59030", icon: Database },
  "set-state": { label: "Variable / Set State", subtitle: "Create or update a variable", color: "#5279bd", icon: Variable },
  transform: { label: "Transform", subtitle: "Map, filter, format, or extract", color: "#9a6ac3", icon: Shuffle },
  loop: { label: "Loop / For Each", subtitle: "Iterate over a collection", color: "#d07b39", icon: Repeat2 },
  retry: { label: "Retry", subtitle: "Retry failures with a limit", color: "#cf6254", icon: RefreshCw },
  wait: { label: "Wait / Delay", subtitle: "Pause before continuing", color: "#6e8aa2", icon: Clock3 },
  code: { label: "Code", subtitle: "Run JavaScript or Python", color: "#404c59", icon: Code2 },
  parser: { label: "Parser", subtitle: "Parse structured documents", color: "#3d9991", icon: Braces },
  join: { label: "Join / Aggregate", subtitle: "Collect multiple outputs", color: "#8d6d44", icon: Combine },
  parallel: { label: "Parallel", subtitle: "Fan a value out to connected branches", color: "#3f86a8", icon: GitBranch },
  "router-condition": { label: "Condition Router", subtitle: "Binary if / else routing", color: "#557f57", icon: Route },
  "router-ai": { label: "AI Router", subtitle: "Choose a path with AI", color: "#c05ca6", icon: BrainCircuit },
  "router-rule": { label: "Rule Router", subtitle: "Choose a path by rule", color: "#4d8f80", icon: Route },
  end: { label: "End", subtitle: "Return the result", color: "#d4565d", icon: CircleStop },
};

function isBuiltinNodeType(type: string): type is BuiltinNodeType {
  return type in NODE_META;
}

function getNodeMeta(type: string, plugins: MagicConchPlugin[]) {
  if (isBuiltinNodeType(type)) return NODE_META[type];
  const definition = plugins.flatMap((plugin) => plugin.nodes).find((node) => node.type === type);
  return {
    label: definition?.label || type,
    subtitle: definition?.subtitle || "Plug-in node",
    color: definition?.color || "#7757a7",
    icon: Plug,
  };
}

function normalizePortType(type?: string): PortDataType {
  const value = (type || "ANY").toLowerCase();
  if (["prompt", "files", "document", "text", "number", "boolean", "any"].includes(value)) {
    return value as PortDataType;
  }
  if (["string", "multiline_string"].includes(value)) return "text";
  if (["document", "pdf"].includes(value)) return "document";
  if (["file", "image", "audio", "video"].includes(value)) return "files";
  return "any";
}

function getNodeSchema(node: FlowNode, plugins: MagicConchPlugin[]): NodeSchema {
  const documentIn: PortSpec = { id: "document", label: "document", type: "document" };
  const documentOut: PortSpec = { id: "document", label: "document", type: "document" };
  if (node.type === "start") return { inputs: [], outputs: [{ id: "prompt", label: "prompt", type: "prompt" }, { id: "files", label: "files", type: "files" }, documentOut] };
  if (node.type === "input") return { inputs: [{ id: "prompt", label: "prompt", type: "prompt" }, { id: "files", label: "files", type: "files" }, documentIn], outputs: [{ id: "prompt", label: "prompt", type: "prompt" }, { id: "files", label: "files", type: "files" }, documentOut] };
  if (node.type === "request") return { inputs: [{ id: "prompt", label: "prompt", type: "prompt" }, { id: "files", label: "files", type: "files" }, documentIn], outputs: [{ id: "prompt", label: "prompt", type: "prompt" }, { id: "files", label: "files", type: "files" }, documentOut] };
  if (node.type === "save") return { inputs: [{ id: "prompt", label: "prompt", type: "prompt" }, { id: "files", label: "files", type: "files" }], outputs: [{ id: "prompt", label: "prompt", type: "prompt" }, { id: "files", label: "files", type: "files" }] };
  if (node.type === "load") return { inputs: [{ id: "trigger", label: "trigger", type: "any" }], outputs: [{ id: "prompt", label: "prompt", type: "prompt" }, { id: "files", label: "files", type: "files" }, documentOut] };
  if (node.type === "set-state") return { inputs: [{ id: "value", label: "value", type: "any" }], outputs: [{ id: "value", label: node.config.variableName || "value", type: "any" }] };
  if (node.type === "transform") return { inputs: [{ id: "value", label: "value", type: "any" }], outputs: [{ id: "result", label: "result", type: "any" }] };
  if (node.type === "loop") return { inputs: [{ id: "items", label: "items", type: "any" }], outputs: [{ id: "item", label: "item", type: "any" }, { id: "index", label: "index", type: "number" }, { id: "has_more", label: "has more", type: "boolean" }, { id: "done", label: "done", type: "boolean" }] };
  if (node.type === "retry") return { inputs: [{ id: "success", label: "success", type: "boolean" }, { id: "error", label: "error", type: "any" }], outputs: [{ id: "next", label: "success", type: "boolean" }, { id: "retry", label: "retry", type: "boolean" }, { id: "failed", label: "failed", type: "boolean" }, { id: "attempt", label: "attempt", type: "number" }, { id: "parameters", label: "parameters", type: "any" }, { id: "error", label: "error", type: "any" }] };
  if (node.type === "wait") return { inputs: [{ id: "value", label: "value", type: "any" }], outputs: [{ id: "value", label: "value", type: "any" }] };
  if (node.type === "code") return { inputs: [{ id: "input", label: "input", type: "any" }], outputs: [{ id: "result", label: "result", type: "any" }] };
  if (node.type === "parser") return { inputs: [{ id: "source", label: "source", type: "any" }, { id: "document", label: "document", type: "document" }], outputs: [{ id: "data", label: "data", type: "any" }, { id: "text", label: "text", type: "text" }] };
  if (node.type === "join") return { inputs: [{ id: "values", label: "values", type: "any", multiple: true }], outputs: [{ id: "result", label: "result", type: "any" }] };
  if (node.type === "parallel") {
    return { inputs: [{ id: "value", label: "value", type: "any" }], outputs: [{ id: "value", label: "value", type: "any", multiple: true }] };
  }
  if (node.type === "router-condition") return { inputs: [{ id: "value", label: "value", type: "any" }, { id: "files", label: "files", type: "files" }, { id: "document", label: "document", type: "document" }], outputs: [{ id: "true", label: "true", type: "any" }, { id: "false", label: "false", type: "any" }, { id: "matched", label: "matched", type: "boolean" }] };
  if (node.type === "router-ai" || node.type === "router-rule") {
    const routeOptions = node.config.routeOptions?.length
      ? node.config.routeOptions
      : [
          { id: "route-1", label: node.config.routeALabel || "Option 1", value: node.config.routeValue || "" },
          ...(node.config.routeBLabel ? [{ id: "route-2", label: node.config.routeBLabel, value: "" }] : []),
        ];
    return {
      inputs: [{ id: "prompt", label: "prompt", type: "prompt" }, { id: "files", label: "files", type: "files" }],
      outputs: routeOptions.map((option) => ({ id: option.id, label: option.label, type: "prompt" as const })),
    };
  }
  if (node.type === "end") return { inputs: [{ id: "prompt", label: "prompt", type: "prompt" }, { id: "files", label: "files", type: "files" }, documentIn], outputs: [] };

  const definition = plugins.flatMap((plugin) => plugin.nodes).find((item) => item.type === node.type);
  const declaredInputs = {
    ...(definition?.inputTypes?.required || {}),
    ...(definition?.inputTypes?.optional || {}),
  };
  return {
    inputs: Object.entries(declaredInputs).map(([id, spec]) => ({ id, label: spec.label || id, type: normalizePortType(spec.type), multiple: spec.multiple })),
    outputs: (definition?.returnTypes || ["PROMPT"]).map((type, index) => ({ id: definition?.returnNames?.[index] || `output_${index + 1}`, label: definition?.returnNames?.[index] || `output ${index + 1}`, type: normalizePortType(type) })),
  };
}

function portValueKey(nodeId: string, portId: string) {
  return `${nodeId}:${portId}`;
}

function portsCompatible(output: PortDataType, input: PortDataType) {
  return output === input || output === "any" || input === "any";
}

function portPoint(
  node: FlowNode,
  portId: string,
  side: "input" | "output",
  plugins: MagicConchPlugin[],
) {
  const ports = side === "input" ? getNodeSchema(node, plugins).inputs : getNodeSchema(node, plugins).outputs;
  const index = Math.max(0, ports.findIndex((port) => port.id === portId));
  return { x: node.x + (side === "output" ? 250 : 0), y: node.y + 62 + index * 25 };
}

function nodeCardHeight(node: FlowNode, plugins: MagicConchPlugin[]) {
  const schema = getNodeSchema(node, plugins);
  return 86 + Math.max(schema.inputs.length, schema.outputs.length) * 25 + (["router-ai", "router-rule"].includes(node.type) ? 27 : 0);
}

function migrateWorkflow(workflow: Workflow, plugins: MagicConchPlugin[]): Workflow {
  const legacyFlowEdges = workflow.edges.filter(
    (edge) => !edge.dataType || !edge.fromPort || !edge.toPort || edge.dataType === "flow" || edge.fromPort === "flow" || edge.toPort === "flow",
  );
  const dataEdges = workflow.edges.filter(
    (edge) => edge.dataType && edge.fromPort && edge.toPort && edge.dataType !== "flow" && edge.fromPort !== "flow" && edge.toPort !== "flow",
  );
  const migrated = [...dataEdges];
  const typePriority: PortDataType[] = ["prompt", "any", "files", "document", "text", "number", "boolean"];

  for (const edge of legacyFlowEdges) {
    if (migrated.some((candidate) => candidate.from === edge.from && candidate.to === edge.to)) continue;
    const sourceNode = workflow.nodes.find((node) => node.id === edge.from);
    const targetNode = workflow.nodes.find((node) => node.id === edge.to);
    if (!sourceNode || !targetNode) continue;
    const sourcePorts = getNodeSchema(sourceNode, plugins).outputs;
    const targetPorts = getNodeSchema(targetNode, plugins).inputs;
    const legacySource = edge.fromPort && edge.fromPort !== "flow"
      ? sourcePorts.find((port) => port.id === edge.fromPort)
      : undefined;
    const legacyTarget = edge.toPort && edge.toPort !== "flow"
      ? targetPorts.find((port) => port.id === edge.toPort)
      : undefined;
    const pairs = sourcePorts.flatMap((output) => targetPorts
      .filter((input) => portsCompatible(output.type, input.type))
      .map((input) => ({ output, input })));
    const pair = legacySource
      ? pairs.find(({ output, input }) => output.id === legacySource.id && (!legacyTarget || input.id === legacyTarget.id))
      : legacyTarget
        ? pairs.find(({ input }) => input.id === legacyTarget.id)
        : [...pairs].sort((a, b) => typePriority.indexOf(a.output.type) - typePriority.indexOf(b.output.type))[0];
    if (!pair) continue;
    migrated.push({
      ...edge,
      fromPort: pair.output.id,
      toPort: pair.input.id,
      dataType: pair.output.type,
    });
  }

  return { ...workflow, version: Math.max(2, workflow.version || 1), edges: migrated };
}

function evaluateRouteRule(node: FlowNode, prompt: string, files: FileAsset[], optionValue?: string) {
  const method = node.config.routeMethod || "contains";
  const rawValue = optionValue ?? node.config.routeValue ?? "";
  const source = node.config.caseSensitive ? prompt : prompt.toLowerCase();
  const value = node.config.caseSensitive ? rawValue : rawValue.toLowerCase();
  if (method === "contains") return source.includes(value);
  if (method === "not_contains") return !source.includes(value);
  if (method === "equals") return source === value;
  if (method === "starts_with") return source.startsWith(value);
  if (method === "ends_with") return source.endsWith(value);
  if (method === "regex") {
    try { return new RegExp(rawValue, node.config.caseSensitive ? "" : "i").test(prompt); } catch { return false; }
  }
  if (method === "length_gt") return prompt.length > Number(rawValue);
  if (method === "length_lt") return prompt.length < Number(rawValue);
  if (method === "is_empty") return prompt.trim().length === 0;
  if (method === "file_type") return files.some((file) => file.type.includes(value) || file.name.toLowerCase().endsWith(value));
  if (method === "file_count_gt") return files.length > Number(rawValue);
  if (method === "number_gt") return Number(prompt) > Number(rawValue);
  if (method === "number_lt") return Number(prompt) < Number(rawValue);
  return false;
}

function valueAtPath(value: unknown, path = "") {
  return path.split(".").filter(Boolean).reduce<unknown>((current, part) => {
    if (current == null) return undefined;
    const key: string | number = /^\d+$/.test(part) ? Number(part) : part;
    return (current as Record<string | number, unknown>)[key];
  }, value);
}

function stringifyValue(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value ?? "", null, 2);
}

function isDocumentAsset(file: FileAsset) {
  return file.type === "application/pdf" || /\.(pdf|docx?|odt|rtf|pages)$/i.test(file.name);
}

function parseLiteral(value: string, type: FlowNode["config"]["valueType"]) {
  if (type === "number") return Number(value);
  if (type === "boolean") return value.trim().toLowerCase() === "true";
  if (type === "json") return JSON.parse(value || "null");
  return value;
}

function transformValue(node: FlowNode, input: unknown) {
  const operation = node.config.transformOperation || "json_parse";
  if (operation === "json_parse") return typeof input === "string" ? JSON.parse(input) : input;
  if (operation === "extract") return valueAtPath(input, node.config.path);
  if (operation === "template") {
    return (node.config.template || "{{value}}").replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, path: string) => {
      const selected = path === "value" ? input : valueAtPath(input, path.replace(/^value\.?/, ""));
      return selected == null ? "" : String(selected);
    });
  }
  if (operation === "regex") return stringifyValue(input).replace(new RegExp(node.config.pattern || "", "g"), node.config.replacement || "");
  const list = Array.isArray(input) ? input : [];
  if (operation === "map") return list.map((item) => node.config.path ? valueAtPath(item, node.config.path) : item);
  if (operation === "filter") {
    const expected = node.config.replacement || "";
    return list.filter((item) => String(node.config.path ? valueAtPath(item, node.config.path) : item).includes(expected));
  }
  return input;
}

function parseStructuredText(text: string, format: FlowNode["config"]["parserFormat"]) {
  const trimmed = text.trimStart();
  const selected = format === "auto"
    ? (trimmed.startsWith("[") || trimmed.startsWith("{") ? "json" : /<[^>]+>/.test(text) ? "xml" : text.includes(",") ? "csv" : "markdown")
    : format || "auto";
  if (selected === "json") return JSON.parse(text);
  if (selected === "xml") {
    const document = new DOMParser().parseFromString(text, "application/xml");
    if (document.querySelector("parsererror")) throw new Error("The XML document is not valid.");
    const convert = (element: Element): unknown => element.children.length
      ? Object.fromEntries(Array.from(element.children).map((child) => [child.tagName, convert(child)]))
      : element.textContent || "";
    return { [document.documentElement.tagName]: convert(document.documentElement) };
  }
  if (selected === "csv") {
    const rows = text.trim().split(/\r?\n/).map((row) => row.split(",").map((cell) => cell.trim()));
    const headers = rows.shift() || [];
    return rows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
  }
  if (selected === "yaml") {
    return Object.fromEntries(text.split(/\r?\n/).map((line) => line.match(/^\s*([^:#]+):\s*(.*)$/)).filter(Boolean).map((match) => [match![1].trim(), match![2].trim()]));
  }
  if (selected === "markdown") {
    const headings = Array.from(text.matchAll(/^(#{1,6})\s+(.+)$/gm)).map((match) => ({ level: match[1].length, text: match[2] }));
    const links = Array.from(text.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)).map((match) => ({ text: match[1], url: match[2] }));
    return { text, headings, links };
  }
  return text;
}

function conditionMatches(node: FlowNode, value: unknown, files: FileAsset[]) {
  const kind = node.config.conditionKind || "truthy";
  const expected = node.config.conditionValue || "";
  if (kind === "truthy") return Boolean(value);
  if (kind === "equals") return String(value) === expected;
  if (kind === "contains") return String(value).includes(expected);
  if (kind === "file_extension") {
    const extension = expected.replace(/^\./, "").toLowerCase();
    return files.some((file) => file.name.toLowerCase().endsWith(`.${extension}`));
  }
  const actualType = Array.isArray(value) ? "array" : value instanceof Blob ? "document" : value === null ? "null" : typeof value;
  return actualType === expected.toLowerCase() || (expected.toLowerCase() === "document" && files.some((file) => file.type === "application/pdf" || /\.(pdf|docx?|odt)$/i.test(file.name)));
}

type PyodideRuntime = {
  globals: { set: (name: string, value: unknown) => void; delete: (name: string) => void };
  runPythonAsync: (code: string) => Promise<unknown>;
};

let pyodidePromise: Promise<PyodideRuntime> | null = null;

async function loadPythonRuntime() {
  if (pyodidePromise) return pyodidePromise;
  pyodidePromise = new Promise<PyodideRuntime>((resolve, reject) => {
    const runtimeWindow = window as typeof window & { loadPyodide?: (options: { indexURL: string }) => Promise<PyodideRuntime> };
    const start = () => runtimeWindow.loadPyodide?.({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/" }).then(resolve, reject);
    if (runtimeWindow.loadPyodide) { start(); return; }
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.js";
    script.async = true;
    script.onload = start;
    script.onerror = () => reject(new Error("The Python runtime could not be loaded. Check the network connection."));
    document.head.appendChild(script);
  });
  return pyodidePromise;
}

async function executeCode(node: FlowNode, input: unknown, context: WorkflowContext) {
  if (node.config.codeLanguage === "python") {
    const runtime = await loadPythonRuntime();
    runtime.globals.set("input", input);
    runtime.globals.set("context", context);
    try { return await runtime.runPythonAsync(node.config.code || "input"); }
    finally { runtime.globals.delete("input"); runtime.globals.delete("context"); }
  }
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (...args: string[]) => (...values: unknown[]) => Promise<unknown>;
  return new AsyncFunction("input", "context", node.config.code || "return input;")(input, context);
}

const initialWorkflow: Workflow = {
  id: "wf-research-assistant",
  name: "Research Assistant",
  description: "Clarifies the task, asks an AI model, and saves the final answer.",
  version: 2,
  updatedAt: new Date().toISOString(),
  nodes: [
    {
      id: "start-1",
      type: "start",
      name: "New message",
      x: 80,
      y: 190,
      config: {
        agentName: "Research Assistant",
        startMessage: "Hello — I’m your research assistant. What would you like to work on?",
      },
    },
    {
      id: "input-1",
      type: "input",
      name: "Message",
      x: 355,
      y: 190,
      config: { prompt: "What format would you like the answer in?" },
    },
    {
      id: "request-1",
      type: "request",
      name: "Ask OpenAI",
      x: 630,
      y: 190,
      config: {
        provider: "openai",
        model: "gpt-4o-mini",
        systemPrompt: "You are a thoughtful research assistant. Be accurate, clear, and concise.",
        temperature: 0.7,
      },
    },
    {
      id: "save-1",
      type: "save",
      name: "Save result",
      x: 905,
      y: 190,
      config: { key: "latest-result" },
    },
    { id: "end-1", type: "end", name: "Reply", x: 1180, y: 190, config: {} },
  ],
  edges: [
    { id: "edge-1p", from: "start-1", fromPort: "prompt", to: "input-1", toPort: "prompt", dataType: "prompt" },
    { id: "edge-2p", from: "input-1", fromPort: "prompt", to: "request-1", toPort: "prompt", dataType: "prompt" },
    { id: "edge-2f", from: "input-1", fromPort: "files", to: "request-1", toPort: "files", dataType: "files" },
    { id: "edge-3p", from: "request-1", fromPort: "prompt", to: "save-1", toPort: "prompt", dataType: "prompt" },
    { id: "edge-3f", from: "request-1", fromPort: "files", to: "save-1", toPort: "files", dataType: "files" },
    { id: "edge-4p", from: "save-1", fromPort: "prompt", to: "end-1", toPort: "prompt", dataType: "prompt" },
    { id: "edge-4f", from: "save-1", fromPort: "files", to: "end-1", toPort: "files", dataType: "files" },
  ],
};

const DEFAULT_AGENT_NAME = "Magic Conch";
const DEFAULT_START_MESSAGE = "Hello — I’m ready to run your workflow. What would you like to accomplish?";

function getStartSettings(workflow: Workflow, syntax?: WorkflowSyntaxContext) {
  const start = workflow.nodes.find((node) => node.type === "start");
  const expand = (value: string) => syntax ? expandWorkflowSyntax(value, syntax) : value;
  return {
    agentName: expand(start?.config.agentName?.trim() || workflow.name.trim() || DEFAULT_AGENT_NAME),
    startMessage: expand(start?.config.startMessage?.trim() || DEFAULT_START_MESSAGE),
  };
}

function createStarterMessages(workflow: Workflow, id = uid("message"), syntax?: WorkflowSyntaxContext): Message[] {
  const { agentName, startMessage } = getStartSettings(workflow, syntax);
  return [{ id, role: "assistant", text: startMessage, time: "Now", meta: agentName }];
}

const starterMessages = createStarterMessages(initialWorkflow, "welcome");
const initialChatSession: ChatSession = {
  id: "session-default",
  title: "New conversation",
  messages: starterMessages,
  workflowId: initialWorkflow.id,
  folderId: null,
  pinned: false,
  updatedAt: new Date(0).toISOString(),
  sessionNumber: 1,
};

const modelDefaults: Record<AIProvider, string> = {
  openai: "gpt-4o-mini",
  gemini: "gemini-2.0-flash",
  claude: "claude-3-5-sonnet-latest",
  ollama: "llama3.2",
};

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function timeNow() {
  return new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" }).format(new Date());
}

function ConchMark({ small = false }: { small?: boolean }) {
  return (
    <span className={`conch-mark ${small ? "small" : ""}`} aria-hidden="true">
      <span className="conch-ring ring-one" />
      <span className="conch-ring ring-two" />
      <span className="conch-pearl" />
    </span>
  );
}

function DebugDataSection({ title, items }: { title: string; items: DebugDatum[] }) {
  if (!items.length) return null;
  return (
    <div className="debug-data-section">
      <span className="debug-data-title">{title}</span>
      {items.map((item) => {
        const files = item.type === "files" && Array.isArray(item.value)
          ? item.value.filter((value): value is FileAsset => Boolean(value && typeof value === "object" && "name" in value))
          : [];
        return (
          <div className={`debug-datum datum-${item.type}`} key={`${title}-${item.port}`}>
            <div><strong>{item.label}</strong><small>{item.type}</small></div>
            {item.type === "files" ? (
              files.length ? <div className="debug-file-list">{files.map((file, index) => <a key={`${file.name}-${index}`} href={file.data} download={file.name} title={`Download ${file.name}`}><FileJson size={12} /><span><b>{file.name}</b><small>{file.type || "file"} · {Math.max(1, Math.round(file.size / 1024))} KB</small></span><Download size={11} /></a>)}</div> : <em>No files</em>
            ) : (
              <pre>{item.value == null ? "No value" : typeof item.value === "string" ? item.value : JSON.stringify(item.value, null, 2)}</pre>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function Workbench() {
  const [tab, setTab] = useState<"chat" | "workflow">("workflow");
  const [workflows, setWorkflows] = useState<Workflow[]>([initialWorkflow]);
  const [activeWorkflowId, setActiveWorkflowId] = useState(initialWorkflow.id);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>("request-1");
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>(["request-1"]);
  const [messages, setMessages] = useState<Message[]>(starterMessages);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([initialChatSession]);
  const [chatFolders, setChatFolders] = useState<ChatFolder[]>([]);
  const [activeSessionId, setActiveSessionId] = useState(initialChatSession.id);
  const [messageInput, setMessageInput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugEvents, setDebugEvents] = useState<DebugEvent[]>([]);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [editingMessage, setEditingMessage] = useState<{ id: string; text: string } | null>(null);
  const [editingWorkflow, setEditingWorkflow] = useState<{ id: string; name: string } | null>(null);
  const [editingChatSession, setEditingChatSession] = useState<{ id: string; title: string } | null>(null);
  const [newChatFolderName, setNewChatFolderName] = useState<string | null>(null);
  const [editingChatFolder, setEditingChatFolder] = useState<{ id: string; name: string } | null>(null);
  const [moveMenuSessionId, setMoveMenuSessionId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [zoom, setZoom] = useState(0.9);
  const [pan, setPan] = useState({ x: 0, y: 28 });
  const [selectionBox, setSelectionBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [connectionSource, setConnectionSource] = useState<{ nodeId: string; portId: string; dataType: PortDataType } | null>(null);
  const [connectionDraft, setConnectionDraft] = useState<{ x: number; y: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [settingsTab, setSettingsTab] = useState<"general" | "api" | "plugins">("api");
  const [providerSettings, setProviderSettings] = useState<ProviderSettings>({
    ollamaUrl: "http://localhost:11434",
  });
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaLoading, setOllamaLoading] = useState(false);
  const [plugins, setPlugins] = useState<MagicConchPlugin[]>([]);
  const [undoLimit, setUndoLimit] = useState(50);
  const [attachedFiles, setAttachedFiles] = useState<FileAsset[]>([]);
  const [workflowFolder, setWorkflowFolder] = useState<DirectoryHandle | null>(null);
  const [databaseFolder, setDatabaseFolder] = useState<DirectoryHandle | null>(null);
  const [pendingInput, setPendingInput] = useState<PendingWorkflowInput | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pluginInputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const workflowAssetInputRef = useRef<HTMLInputElement>(null);
  const chatSessionTitleInputRef = useRef<HTMLInputElement>(null);
  const chatFolderNameInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const undoHistoryRef = useRef<Record<string, Workflow[]>>({});
  const redoHistoryRef = useRef<Record<string, Workflow[]>>({});
  const workflowClipboardRef = useRef<{ nodes: FlowNode[]; edges: FlowEdge[]; pasteCount: number } | null>(null);
  const chatUndoRef = useRef<ChatSnapshot[]>([]);
  const chatRedoRef = useRef<ChatSnapshot[]>([]);
  const dragDepthRef = useRef(0);
  const storageRestoredRef = useRef(false);
  const nodeFolderHandlesRef = useRef<Record<string, DirectoryHandle>>({});
  const dragRef = useRef<{
    startX: number;
    startY: number;
    positions: Record<string, { x: number; y: number }>;
    workflow: Workflow;
    remembered: boolean;
  } | null>(null);
  const panRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);
  const selectionRef = useRef<{ startX: number; startY: number; currentX: number; currentY: number; additive: boolean } | null>(null);
  const connectRef = useRef<{ nodeId: string; portId: string; dataType: PortDataType; pointerId: number } | null>(null);

  const activeWorkflow = useMemo(
    () => workflows.find((workflow) => workflow.id === activeWorkflowId) ?? workflows[0],
    [activeWorkflowId, workflows],
  );
  const sortedChatSessions = useMemo(
    () => [...chatSessions].sort((a, b) => {
      const pinOrder = Number(b.pinned) - Number(a.pinned);
      if (pinOrder) return pinOrder;
      return (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0);
    }),
    [chatSessions],
  );
  const knownChatFolderIds = useMemo(() => new Set(chatFolders.map((folder) => folder.id)), [chatFolders]);
  const unfiledChatSessions = useMemo(
    () => sortedChatSessions.filter((session) => !session.folderId || !knownChatFolderIds.has(session.folderId)),
    [knownChatFolderIds, sortedChatSessions],
  );
  const editingChatSessionId = editingChatSession?.id;

  function syntaxContextFor(workflow = activeWorkflow, sessionId = activeSessionId): WorkflowSyntaxContext {
    const session = chatSessions.find((item) => item.id === sessionId);
    return {
      now: new Date(),
      chatSessionNumber: session?.sessionNumber || 1,
      chatSessionId: session?.id || sessionId,
      chatSessionTitle: session?.title || "New conversation",
      workflowName: workflow.name,
    };
  }

  useEffect(() => {
    if (!editingChatSessionId) return;
    chatSessionTitleInputRef.current?.focus();
    chatSessionTitleInputRef.current?.select();
  }, [editingChatSessionId]);

  useEffect(() => {
    if (newChatFolderName === null && !editingChatFolder) return;
    chatFolderNameInputRef.current?.focus();
    chatFolderNameInputRef.current?.select();
  }, [editingChatFolder, newChatFolderName]);
  const selectedNode = activeWorkflow?.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedMeta = selectedNode ? getNodeMeta(selectedNode.type, plugins) : null;
  const selectedPluginNode: PluginNodeDefinition | undefined = selectedNode
    ? plugins.flatMap((plugin) => plugin.nodes).find((node) => node.type === selectedNode.type)
    : undefined;

  useEffect(() => {
    const restore = window.setTimeout(() => {
      try {
        const savedFlows = localStorage.getItem("magic-conch-workflows");
        const savedSettings = localStorage.getItem("magic-conch-provider-settings");
        const savedPlugins = localStorage.getItem("magic-conch-plugins");
        const savedUndoLimit = localStorage.getItem("magic-conch-undo-limit");
        const savedSessions = localStorage.getItem("magic-conch-chat-sessions");
        const savedChatFolders = localStorage.getItem("magic-conch-chat-folders");
        const savedActiveSession = localStorage.getItem("magic-conch-active-session");
        const restoredPlugins = savedPlugins ? JSON.parse(savedPlugins) as MagicConchPlugin[] : [];
        if (savedFlows) {
          const parsed = JSON.parse(savedFlows) as Workflow[];
          if (parsed.length) {
            const migrated = parsed.map((workflow) => migrateWorkflow({
              ...workflow,
              nodes: workflow.nodes.map((node) => (node.type === "router-ai" || node.type === "router-rule") && !node.config.routeOptions?.length ? {
                ...node,
                config: {
                  ...node.config,
                  routeOptions: [
                    { id: "route-1", label: node.config.routeALabel || "Option 1", value: node.config.routeValue || "" },
                    ...(node.config.routeBLabel ? [{ id: "route-2", label: node.config.routeBLabel, value: "" }] : []),
                  ],
                },
              } : node),
              edges: workflow.edges.map((edge) => ({
                ...edge,
                fromPort: edge.fromPort === "route-a" ? "route-1" : edge.fromPort === "route-b" ? "route-2" : edge.fromPort || "flow",
                toPort: edge.toPort || "flow",
                dataType: edge.dataType || "flow",
              })),
            }, restoredPlugins));
            setWorkflows(migrated);
            setActiveWorkflowId(migrated[0].id);
          }
        }
        if (savedSettings) setProviderSettings(JSON.parse(savedSettings));
        if (savedPlugins) setPlugins(restoredPlugins);
        if (savedUndoLimit) setUndoLimit(Math.max(1, Math.min(500, Number(savedUndoLimit))));
        if (savedChatFolders) {
          const restoredFolders = JSON.parse(savedChatFolders) as Partial<ChatFolder>[];
          setChatFolders(restoredFolders.filter((folder) => folder.id && folder.name).map((folder, index) => ({
            id: folder.id!,
            name: folder.name!,
            collapsed: Boolean(folder.collapsed),
            createdAt: folder.createdAt || new Date(index).toISOString(),
          })));
        }
        if (savedSessions) {
          const restored = JSON.parse(savedSessions) as Partial<ChatSession>[];
          const byAge = [...restored].sort((a, b) => (Date.parse(a.updatedAt || "") || 0) - (Date.parse(b.updatedAt || "") || 0));
          const assignedNumbers = new Map(byAge.map((session, index) => [session.id, session.sessionNumber || index + 1]));
          const sessions = restored.map((session, index) => ({
            ...session,
            sessionNumber: assignedNumbers.get(session.id) || index + 1,
          })) as ChatSession[];
          if (sessions.length) {
            const chosen = sessions.find((session) => session.id === savedActiveSession) || sessions[0];
            setChatSessions(sessions);
            setActiveSessionId(chosen.id);
            setMessages(chosen.messages);
            setActiveWorkflowId(chosen.workflowId);
          }
        }
      } catch {
        showToast("Some saved settings could not be restored");
      } finally {
        storageRestoredRef.current = true;
      }
    }, 0);
    return () => window.clearTimeout(restore);
  }, []);

  useEffect(() => {
    if (!storageRestoredRef.current) return;
    localStorage.setItem("magic-conch-workflows", JSON.stringify(workflows));
  }, [workflows]);

  useEffect(() => {
    if (!storageRestoredRef.current) return;
    localStorage.setItem("magic-conch-provider-settings", JSON.stringify(providerSettings));
  }, [providerSettings]);

  useEffect(() => {
    if (!storageRestoredRef.current) return;
    localStorage.setItem("magic-conch-plugins", JSON.stringify(plugins));
  }, [plugins]);

  useEffect(() => {
    if (!storageRestoredRef.current) return;
    localStorage.setItem("magic-conch-undo-limit", String(undoLimit));
    for (const id of Object.keys(undoHistoryRef.current)) {
      undoHistoryRef.current[id] = undoHistoryRef.current[id].slice(-undoLimit);
    }
    for (const id of Object.keys(redoHistoryRef.current)) {
      redoHistoryRef.current[id] = redoHistoryRef.current[id].slice(-undoLimit);
    }
  }, [undoLimit]);

  useEffect(() => {
    if (!storageRestoredRef.current) return;
    const firstUserMessage = messages.find((message) => message.role === "user")?.text.trim();
    setChatSessions((current) => current.map((session) => session.id === activeSessionId ? {
      ...session,
      messages,
      workflowId: activeWorkflowId,
      title: session.title === "New conversation" && firstUserMessage ? firstUserMessage.slice(0, 42) : session.title,
      updatedAt: new Date().toISOString(),
    } : session));
  }, [activeSessionId, activeWorkflowId, messages]);

  useEffect(() => {
    if (!storageRestoredRef.current) return;
    localStorage.setItem("magic-conch-chat-sessions", JSON.stringify(chatSessions));
    localStorage.setItem("magic-conch-active-session", activeSessionId);
  }, [activeSessionId, chatSessions]);

  useEffect(() => {
    if (!storageRestoredRef.current) return;
    localStorage.setItem("magic-conch-chat-folders", JSON.stringify(chatFolders));
  }, [chatFolders]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isRunning]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2800);
  }

  function currentChatSnapshot(): ChatSnapshot {
    return {
      messages: structuredClone(messages),
      pendingInput: pendingInput ? structuredClone(pendingInput) : null,
    };
  }

  function rememberChat() {
    chatUndoRef.current = [...chatUndoRef.current, currentChatSnapshot()].slice(-100);
    chatRedoRef.current = [];
  }

  function undoChat() {
    const previous = chatUndoRef.current.at(-1);
    if (!previous || isRunning) return;
    chatRedoRef.current = [...chatRedoRef.current, currentChatSnapshot()].slice(-100);
    chatUndoRef.current = chatUndoRef.current.slice(0, -1);
    setMessages(previous.messages);
    setPendingInput(previous.pendingInput);
    setEditingMessage(null);
    showToast("Chat change undone");
  }

  function redoChat() {
    const next = chatRedoRef.current.at(-1);
    if (!next || isRunning) return;
    chatUndoRef.current = [...chatUndoRef.current, currentChatSnapshot()].slice(-100);
    chatRedoRef.current = chatRedoRef.current.slice(0, -1);
    setMessages(next.messages);
    setPendingInput(next.pendingInput);
    setEditingMessage(null);
    showToast("Chat change restored");
  }

  function saveEditedMessage() {
    if (!editingMessage?.text.trim()) return;
    rememberChat();
    setMessages((current) =>
      current.map((message) =>
        message.id === editingMessage.id ? { ...message, text: editingMessage.text.trim() } : message,
      ),
    );
    setEditingMessage(null);
    showToast("Message updated");
  }

  function createChatSession() {
    const sessionNumber = Math.max(0, ...chatSessions.map((session) => session.sessionNumber || 0)) + 1;
    const sessionId = uid("session");
    const syntax = {
      now: new Date(),
      chatSessionNumber: sessionNumber,
      chatSessionId: sessionId,
      chatSessionTitle: "New conversation",
      workflowName: activeWorkflow.name,
    };
    const openingMessages = createStarterMessages(activeWorkflow, uid("message"), syntax);
    const session: ChatSession = {
      id: sessionId,
      title: "New conversation",
      messages: openingMessages,
      workflowId: activeWorkflowId,
      folderId: null,
      pinned: false,
      updatedAt: new Date().toISOString(),
      sessionNumber,
    };
    setChatSessions((current) => [session, ...current]);
    setActiveSessionId(session.id);
    setMessages(openingMessages);
    setPendingInput(null);
    setDebugEvents([]);
    setAttachedFiles([]);
    setMoveMenuSessionId(null);
    chatUndoRef.current = [];
    chatRedoRef.current = [];
  }

  function selectChatSession(sessionId: string) {
    const session = chatSessions.find((item) => item.id === sessionId);
    if (!session || session.id === activeSessionId) return;
    setActiveSessionId(session.id);
    setMessages(session.messages);
    setActiveWorkflowId(session.workflowId);
    setPendingInput(null);
    setDebugEvents([]);
    setEditingMessage(null);
    setMoveMenuSessionId(null);
    chatUndoRef.current = [];
    chatRedoRef.current = [];
  }

  function togglePinSession(sessionId: string) {
    setChatSessions((current) => current.map((session) => session.id === sessionId ? { ...session, pinned: !session.pinned } : session));
  }

  function createChatFolder() {
    const name = newChatFolderName?.trim();
    if (!name) {
      setNewChatFolderName(null);
      return;
    }
    if (chatFolders.some((folder) => folder.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      showToast("A folder with that name already exists");
      return;
    }
    setChatFolders((current) => [...current, {
      id: uid("chat-folder"),
      name,
      collapsed: false,
      createdAt: new Date().toISOString(),
    }]);
    setNewChatFolderName(null);
    showToast("Chat folder created");
  }

  function saveChatFolderRename() {
    if (!editingChatFolder) return;
    const name = editingChatFolder.name.trim();
    if (!name) {
      setEditingChatFolder(null);
      return;
    }
    if (chatFolders.some((folder) => folder.id !== editingChatFolder.id && folder.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      showToast("A folder with that name already exists");
      return;
    }
    setChatFolders((current) => current.map((folder) => folder.id === editingChatFolder.id ? { ...folder, name } : folder));
    setEditingChatFolder(null);
    showToast("Chat folder renamed");
  }

  function toggleChatFolder(folderId: string) {
    setChatFolders((current) => current.map((folder) => folder.id === folderId ? { ...folder, collapsed: !folder.collapsed } : folder));
  }

  function removeChatFolder(folderId: string) {
    setChatFolders((current) => current.filter((folder) => folder.id !== folderId));
    setChatSessions((current) => current.map((session) => session.folderId === folderId ? { ...session, folderId: null } : session));
    setMoveMenuSessionId(null);
    showToast("Folder removed; its chats were kept");
  }

  function moveChatSession(sessionId: string, folderId: string | null) {
    setChatSessions((current) => current.map((session) => session.id === sessionId ? {
      ...session,
      folderId,
      updatedAt: new Date().toISOString(),
    } : session));
    if (folderId) {
      setChatFolders((current) => current.map((folder) => folder.id === folderId ? { ...folder, collapsed: false } : folder));
    }
    setMoveMenuSessionId(null);
    showToast(folderId ? "Chat moved to folder" : "Chat moved out of folder");
  }

  function saveChatSessionRename() {
    if (!editingChatSession) return;
    const title = editingChatSession.title.trim();
    if (title) {
      setChatSessions((current) => current.map((session) => session.id === editingChatSession.id ? {
        ...session,
        title,
        updatedAt: new Date().toISOString(),
      } : session));
      showToast("Chat session renamed");
    }
    setEditingChatSession(null);
  }

  function duplicateChatSession(sessionId: string) {
    const source = chatSessions.find((session) => session.id === sessionId);
    if (!source) return;
    const duplicate: ChatSession = {
      ...structuredClone(source),
      id: uid("session"),
      title: `${source.title} copy`,
      pinned: false,
      updatedAt: new Date().toISOString(),
      sessionNumber: Math.max(0, ...chatSessions.map((session) => session.sessionNumber || 0)) + 1,
    };
    setChatSessions((current) => [duplicate, ...current]);
    setActiveSessionId(duplicate.id);
    setMessages(duplicate.messages);
    setActiveWorkflowId(duplicate.workflowId);
    setPendingInput(null);
    setDebugEvents([]);
    chatUndoRef.current = [];
    chatRedoRef.current = [];
    showToast("Chat session duplicated");
  }

  function deleteChatSession(sessionId: string) {
    const remaining = chatSessions.filter((session) => session.id !== sessionId);
    if (!remaining.length) {
      const replacement: ChatSession = {
        ...initialChatSession,
        id: uid("session"),
        messages: createStarterMessages(activeWorkflow),
        workflowId: activeWorkflowId,
        updatedAt: new Date().toISOString(),
        sessionNumber: Math.max(0, ...chatSessions.map((session) => session.sessionNumber || 0)) + 1,
      };
      setChatSessions([replacement]);
      setActiveSessionId(replacement.id);
      setMessages(replacement.messages);
    } else {
      setChatSessions(remaining);
      if (sessionId === activeSessionId) {
        const next = remaining[0];
        setActiveSessionId(next.id);
        setMessages(next.messages);
        setActiveWorkflowId(next.workflowId);
      }
    }
    setPendingInput(null);
    setDebugEvents([]);
    showToast("Chat session deleted");
  }

  function addDebugEvent(
    node: FlowNode,
    status: DebugEvent["status"],
    detail: string,
    data: { inputs?: DebugDatum[]; outputs?: DebugDatum[] } = {},
  ) {
    const id = uid("debug");
    setDebugEvents((current) => [
      ...current,
      { id, nodeId: node.id, nodeName: node.name, nodeType: getNodeMeta(node.type, plugins).label, status, detail, time: timeNow(), inputs: data.inputs || [], outputs: data.outputs || [] },
    ]);
    return id;
  }

  function updateDebugEvent(
    id: string,
    status: DebugEvent["status"],
    detail: string,
    data: { inputs?: DebugDatum[]; outputs?: DebugDatum[] } = {},
  ) {
    setDebugEvents((current) =>
      current.map((event) => (event.id === id ? { ...event, status, detail, ...data } : event)),
    );
  }

  function handleChatDragEnter(event: ReactDragEvent<HTMLElement>) {
    event.preventDefault();
    dragDepthRef.current += 1;
    if (event.dataTransfer.types.includes("Files")) setIsDraggingFiles(true);
  }

  function handleChatDragLeave(event: ReactDragEvent<HTMLElement>) {
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDraggingFiles(false);
  }

  async function handleChatDrop(event: ReactDragEvent<HTMLElement>) {
    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDraggingFiles(false);
    const files = Array.from(event.dataTransfer.files);
    if (!files.length) return;
    const assets = await Promise.all(files.map(readFileAsset));
    setAttachedFiles((current) => [...current, ...assets]);
    showToast(`${assets.length} file${assets.length === 1 ? "" : "s"} attached`);
  }

  function rememberWorkflow(workflow: Workflow) {
    const history = undoHistoryRef.current[workflow.id] || [];
    undoHistoryRef.current[workflow.id] = [...history, structuredClone(workflow)].slice(-undoLimit);
    redoHistoryRef.current[workflow.id] = [];
  }

  function updateWorkflow(
    updater: (workflow: Workflow) => Workflow,
    options: { remember?: boolean } = {},
  ) {
    setWorkflows((current) =>
      current.map((workflow) => {
        if (workflow.id !== activeWorkflowId) return workflow;
        if (options.remember !== false) rememberWorkflow(workflow);
        return { ...updater(workflow), updatedAt: new Date().toISOString() };
      }),
    );
  }

  function undoWorkflow() {
    const history = undoHistoryRef.current[activeWorkflowId] || [];
    const previous = history.at(-1);
    if (!previous) {
      showToast("Nothing left to undo");
      return;
    }
    undoHistoryRef.current[activeWorkflowId] = history.slice(0, -1);
    const redo = redoHistoryRef.current[activeWorkflowId] || [];
    redoHistoryRef.current[activeWorkflowId] = [...redo, structuredClone(activeWorkflow)].slice(-undoLimit);
    setWorkflows((current) =>
      current.map((workflow) => (workflow.id === activeWorkflowId ? previous : workflow)),
    );
    setSelectedNodeId((id) =>
      id && previous.nodes.some((node) => node.id === id) ? id : null,
    );
    setSelectedNodeIds((ids) => ids.filter((id) => previous.nodes.some((node) => node.id === id)));
    showToast("Last workflow change undone");
  }

  function redoWorkflow() {
    const history = redoHistoryRef.current[activeWorkflowId] || [];
    const next = history.at(-1);
    if (!next) {
      showToast("Nothing left to redo");
      return;
    }
    redoHistoryRef.current[activeWorkflowId] = history.slice(0, -1);
    const undo = undoHistoryRef.current[activeWorkflowId] || [];
    undoHistoryRef.current[activeWorkflowId] = [...undo, structuredClone(activeWorkflow)].slice(-undoLimit);
    setWorkflows((current) =>
      current.map((workflow) => (workflow.id === activeWorkflowId ? next : workflow)),
    );
    setSelectedNodeId((id) => id && next.nodes.some((node) => node.id === id) ? id : null);
    setSelectedNodeIds((ids) => ids.filter((id) => next.nodes.some((node) => node.id === id)));
    showToast("Workflow change restored");
  }

  function updateNode(patch: Partial<FlowNode> & { config?: Partial<FlowNode["config"]> }) {
    if (!selectedNodeId) return;
    updateWorkflow((workflow) => ({
      ...workflow,
      nodes: workflow.nodes.map((node) =>
        node.id === selectedNodeId
          ? { ...node, ...patch, config: { ...node.config, ...patch.config } }
          : node,
      ),
    }));
  }

  function addNode(type: NodeType) {
    const meta = getNodeMeta(type, plugins);
    const pluginDefinition = plugins
      .flatMap((plugin) => plugin.nodes)
      .find((node) => node.type === type);
    const count = activeWorkflow.nodes.filter((node) => node.type === type).length + 1;
    const id = uid(type);
    const node: FlowNode = {
      id,
      type,
      name: count > 1 ? `${meta.label} ${count}` : meta.label,
      x: Math.max(120, (460 - pan.x) / zoom) + count * 18,
      y: Math.max(100, (240 - pan.y) / zoom) + count * 18,
      config:
        type === "request"
          ? { provider: "openai", model: modelDefaults.openai, temperature: 0.7 }
          : type === "input"
            ? { prompt: "What additional information should I know?" }
            : type === "save"
              ? { key: "record-name", collision: "increment", saveFiles: "both" }
              : type === "load"
                ? { key: "record-name", loadMode: "latest" }
                : type === "router-ai"
                  ? { provider: "openai", model: modelDefaults.openai, temperature: 0, routeCriteria: "Choose the most suitable option for the input.", routeOptions: [{ id: "route-1", label: "Option 1", value: "" }] }
                  : type === "router-rule"
                    ? { routeMethod: "contains", routeValue: "urgent", caseSensitive: false, routeOptions: [{ id: "route-1", label: "Option 1", value: "urgent" }] }
                    : type === "set-state"
                      ? { variableName: "result", stateValue: "", valueType: "text" }
                      : type === "transform"
                        ? { transformOperation: "json_parse", path: "", template: "{{value}}" }
                        : type === "retry"
                          ? { maxAttempts: 3, delayMs: 1000, retryParameters: "{}" }
                          : type === "wait"
                            ? { delayMs: 1000 }
                            : type === "code"
                              ? { codeLanguage: "javascript", code: "return input;" }
                              : type === "parser"
                                ? { parserFormat: "auto" }
                                : type === "join"
                                  ? { aggregateOperation: "array" }
                                  : type === "parallel"
                                    ? {}
                                    : type === "router-condition"
                                      ? { conditionKind: "truthy", conditionValue: "" }
                : pluginDefinition
                  ? {
                      pluginConfig: Object.fromEntries(
                        (pluginDefinition.fields || []).map((field) => [field.key, field.default ?? ""]),
                      ),
                    }
                  : {},
    };
    updateWorkflow((workflow) => ({ ...workflow, nodes: [...workflow.nodes, node] }));
    setSelectedNodeId(id);
    setSelectedNodeIds([id]);
    setInspectorOpen(true);
  }

  function deleteSelectedNode() {
    const ids = selectedNodeIds.length ? selectedNodeIds : selectedNodeId ? [selectedNodeId] : [];
    if (!ids.length) return;
    updateWorkflow((workflow) => ({
      ...workflow,
      nodes: workflow.nodes.filter((node) => !ids.includes(node.id)),
      edges: workflow.edges.filter(
        (edge) => !ids.includes(edge.from) && !ids.includes(edge.to),
      ),
    }));
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
    showToast(`${ids.length} node${ids.length === 1 ? "" : "s"} deleted`);
  }

  useEffect(() => {
    function handleWorkflowShortcut(event: KeyboardEvent) {
      if (tab !== "workflow" || settingsOpen) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;

      const commandKey = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (commandKey && key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          const redo = redoHistoryRef.current[activeWorkflowId] || [];
          const next = redo.at(-1);
          if (!next) { showToast("Nothing left to redo"); return; }
          redoHistoryRef.current[activeWorkflowId] = redo.slice(0, -1);
          const undo = undoHistoryRef.current[activeWorkflowId] || [];
          undoHistoryRef.current[activeWorkflowId] = [...undo, structuredClone(activeWorkflow)].slice(-undoLimit);
          setWorkflows((current) => current.map((workflow) => workflow.id === activeWorkflowId ? next : workflow));
          setSelectedNodeId((id) => id && next.nodes.some((node) => node.id === id) ? id : null);
          setSelectedNodeIds((ids) => ids.filter((id) => next.nodes.some((node) => node.id === id)));
          showToast("Workflow change restored");
        } else {
          const undo = undoHistoryRef.current[activeWorkflowId] || [];
          const previous = undo.at(-1);
          if (!previous) { showToast("Nothing left to undo"); return; }
          undoHistoryRef.current[activeWorkflowId] = undo.slice(0, -1);
          const redo = redoHistoryRef.current[activeWorkflowId] || [];
          redoHistoryRef.current[activeWorkflowId] = [...redo, structuredClone(activeWorkflow)].slice(-undoLimit);
          setWorkflows((current) => current.map((workflow) => workflow.id === activeWorkflowId ? previous : workflow));
          setSelectedNodeId((id) => id && previous.nodes.some((node) => node.id === id) ? id : null);
          setSelectedNodeIds((ids) => ids.filter((id) => previous.nodes.some((node) => node.id === id)));
          showToast("Last workflow change undone");
        }
        return;
      }

      if (commandKey && key === "c") {
        const ids = selectedNodeIds.length ? selectedNodeIds : selectedNodeId ? [selectedNodeId] : [];
        const copiedNodes = activeWorkflow.nodes.filter((node) => ids.includes(node.id));
        if (!copiedNodes.length) return;
        event.preventDefault();
        workflowClipboardRef.current = {
          nodes: structuredClone(copiedNodes),
          edges: structuredClone(activeWorkflow.edges.filter((edge) => ids.includes(edge.from) && ids.includes(edge.to))),
          pasteCount: 1,
        };
        showToast(`${copiedNodes.length} node${copiedNodes.length === 1 ? "" : "s"} copied`);
        return;
      }

      if (commandKey && key === "v") {
        const clipboard = workflowClipboardRef.current;
        if (!clipboard?.nodes.length) return;
        event.preventDefault();
        const nodeIds = new Map(clipboard.nodes.map((node) => [node.id, uid("node")]));
        const offset = 35 * clipboard.pasteCount;
        const pastedNodes = clipboard.nodes.map((node) => ({
          ...structuredClone(node),
          id: nodeIds.get(node.id)!,
          x: node.x + offset,
          y: node.y + offset,
        }));
        const pastedEdges = clipboard.edges.map((edge) => ({
          ...structuredClone(edge),
          id: uid("edge"),
          from: nodeIds.get(edge.from)!,
          to: nodeIds.get(edge.to)!,
        }));
        setWorkflows((current) => current.map((workflow) => {
          if (workflow.id !== activeWorkflowId) return workflow;
          const undo = undoHistoryRef.current[workflow.id] || [];
          undoHistoryRef.current[workflow.id] = [...undo, structuredClone(workflow)].slice(-undoLimit);
          redoHistoryRef.current[workflow.id] = [];
          return { ...workflow, nodes: [...workflow.nodes, ...pastedNodes], edges: [...workflow.edges, ...pastedEdges], updatedAt: new Date().toISOString() };
        }));
        clipboard.pasteCount += 1;
        const pastedIds = pastedNodes.map((node) => node.id);
        setSelectedNodeIds(pastedIds);
        setSelectedNodeId(pastedIds.at(-1) || null);
        showToast(`${pastedNodes.length} node${pastedNodes.length === 1 ? "" : "s"} pasted`);
        return;
      }

      if (!selectedNodeIds.length || (event.key !== "Delete" && event.key !== "Backspace")) return;
      event.preventDefault();
      const ids = selectedNodeIds;
      setWorkflows((current) => current.map((workflow) => {
        if (workflow.id !== activeWorkflowId) return workflow;
        const history = undoHistoryRef.current[workflow.id] || [];
        undoHistoryRef.current[workflow.id] = [...history, structuredClone(workflow)].slice(-undoLimit);
        redoHistoryRef.current[workflow.id] = [];
        return { ...workflow, nodes: workflow.nodes.filter((node) => !ids.includes(node.id)), edges: workflow.edges.filter((edge) => !ids.includes(edge.from) && !ids.includes(edge.to)), updatedAt: new Date().toISOString() };
      }));
      setSelectedNodeId(null);
      setSelectedNodeIds([]);
      showToast(`${ids.length} node${ids.length === 1 ? "" : "s"} deleted`);
    }
    window.addEventListener("keydown", handleWorkflowShortcut);
    return () => window.removeEventListener("keydown", handleWorkflowShortcut);
  }, [activeWorkflow, activeWorkflowId, selectedNodeId, selectedNodeIds, settingsOpen, tab, undoLimit]);

  function beginNodeDrag(event: ReactPointerEvent, node: FlowNode) {
    event.stopPropagation();
    if (event.button !== 0) return;
    event.preventDefault();
    if (event.shiftKey) {
      const next = selectedNodeIds.includes(node.id)
        ? selectedNodeIds.filter((id) => id !== node.id)
        : [...selectedNodeIds, node.id];
      setSelectedNodeIds(next);
      setSelectedNodeId(next.includes(node.id) ? node.id : next.at(-1) || null);
      return;
    }
    canvasRef.current?.setPointerCapture(event.pointerId);
    const movingIds = selectedNodeIds.includes(node.id) ? selectedNodeIds : [node.id];
    if (!selectedNodeIds.includes(node.id)) setSelectedNodeIds([node.id]);
    setSelectedNodeId(node.id);
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      positions: Object.fromEntries(activeWorkflow.nodes.filter((candidate) => movingIds.includes(candidate.id)).map((candidate) => [candidate.id, { x: candidate.x, y: candidate.y }])),
      workflow: structuredClone(activeWorkflow),
      remembered: false,
    };
  }

  function movePointer(event: ReactPointerEvent) {
    if (connectRef.current && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      setConnectionDraft({
        x: (event.clientX - rect.left - pan.x) / zoom,
        y: (event.clientY - rect.top - pan.y) / zoom,
      });
    } else if (dragRef.current) {
      const drag = dragRef.current;
      const deltaX = (event.clientX - drag.startX) / zoom;
      const deltaY = (event.clientY - drag.startY) / zoom;
      if (!drag.remembered) {
        if (Math.hypot(deltaX, deltaY) < 2) return;
        rememberWorkflow(drag.workflow);
        drag.remembered = true;
      }
      updateWorkflow((workflow) => ({
        ...workflow,
        nodes: workflow.nodes.map((node) => drag.positions[node.id] ? { ...node, x: Math.max(20, drag.positions[node.id].x + deltaX), y: Math.max(20, drag.positions[node.id].y + deltaY) } : node),
      }), { remember: false });
    } else if (selectionRef.current && canvasRef.current) {
      selectionRef.current.currentX = event.clientX;
      selectionRef.current.currentY = event.clientY;
      const rect = canvasRef.current.getBoundingClientRect();
      setSelectionBox({
        x: Math.min(selectionRef.current.startX, event.clientX) - rect.left,
        y: Math.min(selectionRef.current.startY, event.clientY) - rect.top,
        width: Math.abs(event.clientX - selectionRef.current.startX),
        height: Math.abs(event.clientY - selectionRef.current.startY),
      });
    } else if (panRef.current) {
      setPan({
        x: panRef.current.panX + event.clientX - panRef.current.startX,
        y: panRef.current.panY + event.clientY - panRef.current.startY,
      });
    }
  }

  function beginConnection(event: ReactPointerEvent, nodeId: string, port: PortSpec) {
    event.stopPropagation();
    if (event.button !== 0) return;
    event.preventDefault();
    canvasRef.current?.setPointerCapture(event.pointerId);
    connectRef.current = { nodeId, portId: port.id, dataType: port.type, pointerId: event.pointerId };
    setConnectionSource({ nodeId, portId: port.id, dataType: port.type });
    if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      setConnectionDraft({
        x: (event.clientX - rect.left - pan.x) / zoom,
        y: (event.clientY - rect.top - pan.y) / zoom,
      });
    }
  }

  function finishPointer(event: ReactPointerEvent) {
    if (connectRef.current) {
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>(
        "[data-input-node]",
      );
      const targetId = target?.dataset.inputNode;
      const targetPort = target?.dataset.inputPort;
      const targetType = target?.dataset.inputType as PortDataType | undefined;
      if (targetId && targetPort && targetType) connectTo(targetId, targetPort, targetType);
      else {
        setConnectionSource(null);
        setConnectionDraft(null);
      }
      connectRef.current = null;
    }
    if (selectionRef.current && canvasRef.current) {
      const selection = selectionRef.current;
      const rect = canvasRef.current.getBoundingClientRect();
      const left = (Math.min(selection.startX, selection.currentX) - rect.left - pan.x) / zoom;
      const top = (Math.min(selection.startY, selection.currentY) - rect.top - pan.y) / zoom;
      const right = (Math.max(selection.startX, selection.currentX) - rect.left - pan.x) / zoom;
      const bottom = (Math.max(selection.startY, selection.currentY) - rect.top - pan.y) / zoom;
      const found = activeWorkflow.nodes.filter((node) => node.x < right && node.x + 250 > left && node.y < bottom && node.y + nodeCardHeight(node, plugins) > top).map((node) => node.id);
      const next = selection.additive ? Array.from(new Set([...selectedNodeIds, ...found])) : found;
      setSelectedNodeIds(next);
      setSelectedNodeId(next.at(-1) || null);
      setSelectionBox(null);
      selectionRef.current = null;
    }
    dragRef.current = null;
    panRef.current = null;
  }

  function beginPan(event: ReactPointerEvent) {
    const target = event.target as Element;
    if (target.closest(".flow-node, .edge-hit, .zoom-controls")) return;
    if (event.button !== 0 && event.button !== 1) return;
    event.preventDefault();
    if (event.button === 1 || event.altKey) {
      panRef.current = { startX: event.clientX, startY: event.clientY, panX: pan.x, panY: pan.y };
    } else {
      selectionRef.current = { startX: event.clientX, startY: event.clientY, currentX: event.clientX, currentY: event.clientY, additive: event.shiftKey };
      const rect = canvasRef.current?.getBoundingClientRect();
      setSelectionBox({ x: event.clientX - (rect?.left || 0), y: event.clientY - (rect?.top || 0), width: 0, height: 0 });
      if (!event.shiftKey) { setSelectedNodeId(null); setSelectedNodeIds([]); }
    }
    canvasRef.current?.setPointerCapture(event.pointerId);
  }

  function zoomCanvasWithWheel(event: ReactWheelEvent<HTMLDivElement>) {
    if (!canvasRef.current) return;
    // Let the browser handle its native page zoom gesture. Canvas coordinates
    // already use CSS pixels, so intercepting Ctrl/Cmd + wheel here makes the
    // scene zoom independently from the rest of the page.
    if (event.ctrlKey || event.metaKey) return;
    event.preventDefault();

    const rect = canvasRef.current.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const nextZoom = Math.max(0.55, Math.min(1.35, zoom * Math.exp(-event.deltaY * 0.0015)));
    if (nextZoom === zoom) return;

    const sceneX = (pointerX - pan.x) / zoom;
    const sceneY = (pointerY - pan.y) / zoom;
    setPan({
      x: pointerX - sceneX * nextZoom,
      y: pointerY - sceneY * nextZoom,
    });
    setZoom(nextZoom);
  }

  function connectTo(targetId: string, targetPort: string, targetType: PortDataType) {
    const source = connectRef.current || connectionSource;
    if (!source || source.nodeId === targetId) return;
    if (!portsCompatible(source.dataType, targetType)) {
      showToast(`${source.dataType} cannot connect to ${targetType}`);
      setConnectionSource(null);
      setConnectionDraft(null);
      return;
    }
    const exists = activeWorkflow.edges.some(
      (edge) => edge.from === source.nodeId && edge.fromPort === source.portId && edge.to === targetId && edge.toPort === targetPort,
    );
    if (!exists) {
      updateWorkflow((workflow) => ({
        ...workflow,
        edges: [
          ...workflow.edges.filter((edge) => {
            const targetNode = workflow.nodes.find((node) => node.id === targetId);
            const targetSpec = targetNode && getNodeSchema(targetNode, plugins).inputs.find((port) => port.id === targetPort);
            return targetSpec?.multiple || edge.to !== targetId || edge.toPort !== targetPort;
          }),
          { id: uid("edge"), from: source.nodeId, fromPort: source.portId, to: targetId, toPort: targetPort, dataType: source.dataType },
        ],
        nodes: workflow.nodes.map((node) => {
          if (node.id !== source.nodeId || !["router-ai", "router-rule"].includes(node.type)) return node;
          const options = node.config.routeOptions?.length ? node.config.routeOptions : [{ id: source.portId, label: "Option 1", value: node.config.routeValue || "" }];
          if (options.at(-1)?.id !== source.portId) return node;
          return { ...node, config: { ...node.config, routeOptions: [...options, { id: uid("route"), label: `Option ${options.length + 1}`, value: "" }] } };
        }),
      }));
    }
    setConnectionSource(null);
    setConnectionDraft(null);
  }

  function removeEdge(edgeId: string) {
    updateWorkflow((workflow) => ({
      ...workflow,
      edges: workflow.edges.filter((edge) => edge.id !== edgeId),
    }));
    showToast("Connection removed");
  }

  function disconnectInput(nodeId: string, portId: string) {
    updateWorkflow((workflow) => ({
      ...workflow,
      edges: workflow.edges.filter((edge) => edge.to !== nodeId || edge.toPort !== portId),
    }));
    showToast("Port disconnected");
  }

  function addRouteOption(nodeId: string) {
    updateWorkflow((workflow) => ({
      ...workflow,
      nodes: workflow.nodes.map((node) => {
        if (node.id !== nodeId) return node;
        const options = node.config.routeOptions || [];
        return { ...node, config: { ...node.config, routeOptions: [...options, { id: uid(node.type === "parallel" ? "branch" : "route"), label: `${node.type === "parallel" ? "Branch" : "Option"} ${options.length + 1}`, value: "" }] } };
      }),
    }));
  }

  function removeRouteOption(nodeId: string, optionId: string) {
    updateWorkflow((workflow) => {
      const router = workflow.nodes.find((node) => node.id === nodeId);
      if (!router) return workflow;
      const options = router.config.routeOptions?.length
        ? router.config.routeOptions
        : [{ id: "route-1", label: router.config.routeALabel || "Option 1", value: router.config.routeValue || "" }];
      if (options.length <= 1) return workflow;
      return {
        ...workflow,
        nodes: workflow.nodes.map((node) => node.id === nodeId ? {
          ...node,
          config: { ...node.config, routeOptions: options.filter((option) => option.id !== optionId) },
        } : node),
        edges: workflow.edges.filter((edge) => edge.from !== nodeId || edge.fromPort !== optionId),
      };
    });
  }

  function newWorkflow() {
    const id = uid("workflow");
    const workflow: Workflow = {
      id,
      name: "Untitled workflow",
      description: "A new automation workflow.",
      version: 2,
      updatedAt: new Date().toISOString(),
      nodes: [
        {
          id: uid("start"),
          type: "start",
          name: "Start",
          x: 100,
          y: 180,
          config: { agentName: DEFAULT_AGENT_NAME, startMessage: DEFAULT_START_MESSAGE },
        },
        { id: uid("end"), type: "end", name: "End", x: 440, y: 180, config: {} },
      ],
      edges: [],
    };
    setWorkflows((current) => [...current, workflow]);
    setActiveWorkflowId(id);
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
    setPan({ x: 0, y: 28 });
    showToast("New workflow created");
  }

  function saveWorkflowRename() {
    if (!editingWorkflow) return;
    const name = editingWorkflow.name.trim();
    if (name) {
      setWorkflows((current) => current.map((workflow) => workflow.id === editingWorkflow.id ? { ...workflow, name, updatedAt: new Date().toISOString() } : workflow));
    }
    setEditingWorkflow(null);
  }

  function duplicateWorkflow(workflowId: string) {
    const source = workflows.find((workflow) => workflow.id === workflowId);
    if (!source) return;
    const nodeIds = new Map(source.nodes.map((node) => [node.id, uid(node.type)]));
    const duplicate: Workflow = {
      ...structuredClone(source),
      id: uid("workflow"),
      name: `${source.name} copy`,
      updatedAt: new Date().toISOString(),
      nodes: source.nodes.map((node) => ({ ...structuredClone(node), id: nodeIds.get(node.id)!, x: node.x + 35, y: node.y + 35 })),
      edges: source.edges.map((edge) => ({ ...structuredClone(edge), id: uid("edge"), from: nodeIds.get(edge.from)!, to: nodeIds.get(edge.to)! })),
    };
    setWorkflows((current) => [...current, duplicate]);
    setActiveWorkflowId(duplicate.id);
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
    showToast("Workflow duplicated");
  }

  function deleteWorkflow(workflowId: string) {
    if (workflows.length <= 1) {
      showToast("Keep at least one workflow");
      return;
    }
    const remaining = workflows.filter((workflow) => workflow.id !== workflowId);
    const replacement = remaining[0];
    setWorkflows(remaining);
    setChatSessions((current) => current.map((session) => session.workflowId === workflowId ? { ...session, workflowId: replacement.id } : session));
    if (activeWorkflowId === workflowId) {
      setActiveWorkflowId(replacement.id);
      setSelectedNodeId(null);
      setSelectedNodeIds([]);
    }
    showToast("Workflow deleted");
  }

  async function writeJsonToFolder(folder: DirectoryHandle, filename: string, value: unknown) {
    const file = await folder.getFileHandle(filename, { create: true });
    const writable = await file.createWritable();
    await writable.write(JSON.stringify(value, null, 2));
    await writable.close();
  }

  async function fileExists(folder: DirectoryHandle, filename: string) {
    try {
      await folder.getFileHandle(filename);
      return true;
    } catch {
      return false;
    }
  }

  async function collisionSafeName(
    folder: DirectoryHandle,
    filename: string,
    collision: FlowNode["config"]["collision"] = "increment",
  ) {
    if (collision === "overwrite" || !(await fileExists(folder, filename))) return filename;
    const dot = filename.lastIndexOf(".");
    const stem = dot > 0 ? filename.slice(0, dot) : filename;
    const extension = dot > 0 ? filename.slice(dot) : "";
    if (collision === "timestamp") {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      return `${stem}-${stamp}${extension}`;
    }
    let index = 2;
    while (await fileExists(folder, `${stem}-${index}${extension}`)) index += 1;
    return `${stem}-${index}${extension}`;
  }

  async function writeAssetToFolder(folder: DirectoryHandle, asset: FileAsset, filename: string) {
    const file = await folder.getFileHandle(filename, { create: true });
    const writable = await file.createWritable();
    const response = await fetch(asset.data);
    await writable.write(await response.blob());
    await writable.close();
  }

  function subfolderSegments(path = "") {
    const normalized = path.trim().replace(/\\/g, "/");
    if (!normalized || normalized === ".") return [];
    if (normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized)) {
      throw new Error("Subfolder paths must be relative to the selected directory.");
    }
    const segments = normalized.split("/").filter((segment) => segment && segment !== ".");
    if (segments.some((segment) => segment === ".." || /[<>:"|?*]/.test(segment) || [...segment].some((character) => character.charCodeAt(0) < 32))) {
      throw new Error("The subfolder path contains an unsupported segment.");
    }
    return segments;
  }

  async function resolveSubfolder(folder: DirectoryHandle, segments: string[], create: boolean) {
    let current = folder;
    for (const segment of segments) {
      current = await current.getDirectoryHandle(segment, { create });
    }
    return current;
  }

  function localRecordKey(safeKey: string, segments: string[]) {
    return `magic-conch-record:${segments.length ? `${segments.join("/")}/` : ""}${safeKey}`;
  }

  async function chooseFolder(kind: "workflow" | "database" | "node", nodeId?: string) {
    const picker = (window as unknown as { showDirectoryPicker?: () => Promise<DirectoryHandle> })
      .showDirectoryPicker;
    if (!picker) {
      showToast("Folder access needs Chrome, Edge, or the desktop app");
      return;
    }
    try {
      const handle = await picker();
      if (kind === "workflow") setWorkflowFolder(handle);
      else if (kind === "database") setDatabaseFolder(handle);
      else if (nodeId) {
        nodeFolderHandlesRef.current[nodeId] = handle;
        if (nodeId === selectedNodeId) updateNode({ config: { directoryName: handle.name } });
      }
      showToast(`${handle.name} connected`);
    } catch {
      // The user may intentionally cancel the picker.
    }
  }

  function readFileAsset(file: File): Promise<FileAsset> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        resolve({ name: file.name, type: file.type || "application/octet-stream", data: String(reader.result), size: file.size });
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async function addWorkflowFiles(event: ChangeEvent<HTMLInputElement>) {
    const assets = await Promise.all(Array.from(event.target.files || []).map(readFileAsset));
    if (assets.length) {
      updateWorkflow((workflow) => ({ ...workflow, files: [...(workflow.files || []), ...assets] }));
      showToast(`${assets.length} workflow file${assets.length === 1 ? "" : "s"} added`);
    }
    event.target.value = "";
  }

  async function addMessageFiles(event: ChangeEvent<HTMLInputElement>) {
    const assets = await Promise.all(Array.from(event.target.files || []).map(readFileAsset));
    setAttachedFiles((current) => [...current, ...assets]);
    event.target.value = "";
  }

  function importPlugin(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const plugin = validatePlugin(JSON.parse(String(reader.result)));
        setPlugins((current) => [...current.filter((item) => item.id !== plugin.id), plugin]);
        showToast(`${plugin.name} installed`);
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Invalid plug-in manifest");
      }
      event.target.value = "";
    };
    reader.readAsText(file);
  }

  async function loadOllamaModels() {
    setOllamaLoading(true);
    try {
      const baseUrl = (providerSettings.ollamaUrl || "http://localhost:11434").replace(/\/$/, "");
      const response = await fetch(`${baseUrl}/api/tags`);
      if (!response.ok) throw new Error(`Ollama returned ${response.status}`);
      const data = await response.json();
      const models = (data.models || []).map((model: { name: string }) => model.name);
      setOllamaModels(models);
      showToast(`${models.length} Ollama model${models.length === 1 ? "" : "s"} loaded`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not reach Ollama");
    } finally {
      setOllamaLoading(false);
    }
  }

  async function saveWorkflow() {
    if (!activeWorkflow) return;
    if (workflowFolder) {
      const filename = `${activeWorkflow.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "workflow"}.json`;
      await writeJsonToFolder(workflowFolder, filename, activeWorkflow);
      for (const asset of activeWorkflow.files || []) {
        const assetName = await collisionSafeName(workflowFolder, asset.name, "increment");
        await writeAssetToFolder(workflowFolder, asset, assetName);
      }
      showToast(`Saved to ${workflowFolder.name}`);
    } else {
      showToast("Saved in this browser");
    }
  }

  function exportWorkflow() {
    const blob = new Blob([JSON.stringify(activeWorkflow, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${activeWorkflow.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "workflow"}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("Workflow exported");
  }

  function importWorkflow(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as Workflow;
        if (!parsed.nodes || !parsed.edges || !parsed.name) throw new Error();
        const imported = migrateWorkflow({ ...parsed, id: uid("workflow"), updatedAt: new Date().toISOString() }, plugins);
        setWorkflows((current) => [...current, imported]);
        setActiveWorkflowId(imported.id);
        showToast("Workflow imported");
      } catch {
        showToast("That file is not a valid workflow");
      }
      event.target.value = "";
    };
    reader.readAsText(file);
  }

  async function persistRecord(node: FlowNode, value: string, files: FileAsset[]) {
    const key = node.config.key || "workflow-result";
    const safeKey = (key || "workflow-result").replace(/[^a-zA-Z0-9-_]/g, "-");
    const segments = subfolderSegments(node.config.subfolder);
    const rootFolder = nodeFolderHandlesRef.current[node.id] || databaseFolder;
    const folder = rootFolder ? await resolveSubfolder(rootFolder, segments, true) : null;
    const savedFiles: string[] = [];
    if (folder && node.config.saveFiles !== "data") {
      for (const asset of files) {
        const filename = await collisionSafeName(folder, asset.name, node.config.collision);
        await writeAssetToFolder(folder, asset, filename);
        savedFiles.push(filename);
      }
    }
    const record = { key: safeKey, value, files: savedFiles, savedAt: new Date().toISOString() };
    localStorage.setItem(localRecordKey(safeKey, segments), JSON.stringify(record));
    if (folder && node.config.saveFiles !== "files") {
      const filename = await collisionSafeName(folder, `${safeKey}.json`, node.config.collision);
      await writeJsonToFolder(folder, filename, record);
    }
  }

  async function loadRecord(node: FlowNode) {
    const safeKey = (node.config.key || "workflow-result").replace(/[^a-zA-Z0-9-_]/g, "-");
    const segments = subfolderSegments(node.config.subfolder);
    const rootFolder = nodeFolderHandlesRef.current[node.id] || databaseFolder;
    if (!rootFolder) {
      const raw = localStorage.getItem(localRecordKey(safeKey, segments));
      return raw ? JSON.parse(raw).value : "No saved record was found.";
    }
    let folder: DirectoryHandle;
    try {
      folder = await resolveSubfolder(rootFolder, segments, false);
    } catch {
      return "The configured subfolder was not found.";
    }
    const matches: { name: string; modified: number; text: string }[] = [];
    for await (const entry of folder.values()) {
      if (entry.kind !== "file" || !entry.getFile) continue;
      const exact = entry.name === `${safeKey}.json`;
      const versioned = entry.name.startsWith(`${safeKey}-`) && entry.name.endsWith(".json");
      if ((node.config.loadMode === "exact" ? exact : exact || versioned)) {
        const file = await entry.getFile();
        matches.push({ name: entry.name, modified: file.lastModified, text: await file.text() });
      }
    }
    if (!matches.length) return "No matching files were found.";
    matches.sort((a, b) => b.modified - a.modified);
    const selected = node.config.loadMode === "all" ? matches : [matches[0]];
    return selected
      .map((match) => {
        try { return JSON.parse(match.text).value ?? match.text; } catch { return match.text; }
      })
      .join("\n\n");
  }

  async function executeGraphNode(
    sourceNode: FlowNode,
    context: WorkflowContext,
    availablePortKeys: Set<string>,
  ): Promise<{ emittedPortKeys: string[]; endResult?: { text: string; files: FileAsset[] } }> {
      const node = expandWorkflowSyntaxInValue(sourceNode, context.syntax);
      const emittedPortKeys = new Set<string>();
      const inputFor = <T,>(portId: string, fallback: T): T => {
        const edges = activeWorkflow.edges.filter(
          (candidate) => candidate.to === node.id && candidate.toPort === portId && availablePortKeys.has(portValueKey(candidate.from, candidate.fromPort || "")),
        );
        if (!edges.length) return fallback;
        const multiple = getNodeSchema(node, plugins).inputs.find((port) => port.id === portId)?.multiple;
        if (multiple) {
          return edges.map((edge) => context.values[portValueKey(edge.from, edge.fromPort || "")]).filter((value) => value !== undefined) as T;
        }
        const edge = edges[0];
        const value = context.values[portValueKey(edge.from, edge.fromPort || "")];
        return (value === undefined ? fallback : value) as T;
      };
      const output = (portId: string, value: unknown) => {
        const key = portValueKey(node.id, portId);
        context.values[key] = value;
        emittedPortKeys.add(key);
      };
      const promptInput = inputFor("prompt", context.additionalInput || context.userMessage);
      const suppliedFiles = inputFor<unknown>("files", context.files);
      const fileInput = (Array.isArray(suppliedFiles) ? suppliedFiles : [suppliedFiles]).filter(
        (file): file is FileAsset => Boolean(file && typeof file === "object" && "name" in file && "data" in file),
      );
      const documentInput = inputFor<FileAsset[] | FileAsset | undefined>("document", undefined);
      const connectedDocuments = (documentInput ? (Array.isArray(documentInput) ? documentInput : [documentInput]) : []).filter(
        (file): file is FileAsset => Boolean(file && typeof file === "object" && "name" in file && "data" in file),
      );
      connectedDocuments.forEach((document) => {
        if (!fileInput.some((file) => file.name === document.name && file.data === document.data)) fileInput.push(document);
      });
      const nodeSchema = getNodeSchema(node, plugins);
      const debugInputs: DebugDatum[] = nodeSchema.inputs
        .map((port) => ({
          port: port.id,
          label: port.label,
          type: port.type,
          value: port.type === "prompt" ? promptInput : port.type === "files" ? fileInput : port.type === "document" ? inputFor(port.id, fileInput) : inputFor(port.id, undefined),
        }));
      if (node.type === "request" && node.config.systemPrompt) {
        debugInputs.push({ port: "system-prompt", label: "system prompt", type: "prompt", value: node.config.systemPrompt });
      }
      if (node.type === "input" && node.config.prompt) {
        debugInputs.push({ port: "question", label: "question", type: "prompt", value: node.config.prompt });
      }
      if (node.type === "router-ai" && node.config.routeCriteria) {
        debugInputs.push({ port: "route-criteria", label: "routing criteria", type: "prompt", value: node.config.routeCriteria });
      }
      if (node.type === "router-rule" && node.config.routeMethod !== "is_empty") {
        (node.config.routeOptions || [{ id: "route-1", label: "Option 1", value: node.config.routeValue || "" }]).forEach((option) => {
          debugInputs.push({ port: `${option.id}-value`, label: `${option.label} match`, type: "text", value: option.value || "" });
        });
      }
      const collectDebugOutputs = (): DebugDatum[] => nodeSchema.outputs
        .map((port) => ({ port: port.id, label: port.label, type: port.type, value: context.values[portValueKey(node.id, port.id)] }))
        .filter((datum) => datum.value !== undefined);
      let debugStatus: DebugEvent["status"] = "completed";
      let debugDetail = `Received ${String(promptInput || "").length} prompt characters and ${fileInput.length} file${fileInput.length === 1 ? "" : "s"}.`;
      const debugId = addDebugEvent(node, "running", "Processing node inputs…", { inputs: debugInputs });

      if (node.type === "request") {
        const textFiles = fileInput
          .filter((file) => file.type.startsWith("text/") || file.type.includes("json"))
          .map((file) => {
            const encoded = file.data.split(",")[1] || "";
            try { return `File ${file.name}:\n${atob(encoded)}`; } catch { return `File attached: ${file.name}`; }
          });
        const prompt = [
          String(promptInput),
          ...textFiles,
        ]
          .filter(Boolean)
          .join("\n\n");
        context.lastOutput = await requestAI(
          {
            provider: node.config.provider || "openai",
            model: node.config.model || modelDefaults[node.config.provider || "openai"],
            systemPrompt: node.config.systemPrompt,
            temperature: node.config.temperature,
            prompt,
          },
          providerSettings,
        );
        if (node.config.outputFileName) {
          const created = await readFileAsset(
            new File([context.lastOutput], node.config.outputFileName, { type: "text/plain" }),
          );
          fileInput.push(created);
        }
        output("prompt", context.lastOutput);
        output("files", fileInput);
        output("document", fileInput.filter(isDocumentAsset));
        debugDetail = `Generated ${context.lastOutput.length} prompt characters and passed ${fileInput.length} file${fileInput.length === 1 ? "" : "s"}.`;
      }

      if (node.type === "save") {
        await persistRecord(node, String(promptInput), fileInput);
        output("prompt", promptInput);
        output("files", fileInput);
        debugDetail = `Saved prompt data and ${fileInput.length} file${fileInput.length === 1 ? "" : "s"}.`;
      }

      if (node.type === "load") {
        const loadedData = await loadRecord(node);
        context.loadedData = loadedData;
        context.lastOutput = loadedData;
        output("prompt", loadedData);
        output("files", []);
        output("document", []);
        debugDetail = `Loaded ${loadedData.length} prompt characters from storage.`;
      }

      if (node.type === "set-state") {
        const connectedValue = inputFor<unknown>("value", undefined);
        const value = connectedValue === undefined ? parseLiteral(node.config.stateValue || "", node.config.valueType) : connectedValue;
        const variableName = node.config.variableName?.trim() || "result";
        context.values[variableName] = value;
        output("value", value);
        context.lastOutput = stringifyValue(value);
        debugDetail = `Set workflow variable “${variableName}”.`;
      }

      if (node.type === "transform") {
        const value = inputFor<unknown>("value", promptInput);
        const result = transformValue(node, value);
        output("result", result);
        context.lastOutput = stringifyValue(result);
        debugDetail = `Applied ${node.config.transformOperation || "json_parse"} transformation.`;
      }

      if (node.type === "loop") {
        const source = inputFor<unknown>("items", fileInput.length ? fileInput : promptInput);
        const items = Array.isArray(source) ? source : source && typeof source === "object" ? Object.entries(source as Record<string, unknown>).map(([key, value]) => ({ key, value })) : [source];
        const stateKey = `__loop:${node.id}`;
        const index = Number(context.values[stateKey] || 0);
        if (index < items.length) {
          output("item", items[index]);
          output("index", index);
          output("has_more", index + 1 < items.length);
          context.values[stateKey] = index + 1;
          debugStatus = "routed";
          debugDetail = `Emitted item ${index + 1} of ${items.length}.`;
        } else {
          delete context.values[stateKey];
          output("done", true);
          debugStatus = "routed";
          debugDetail = `Completed ${items.length} iteration${items.length === 1 ? "" : "s"}.`;
        }
      }

      if (node.type === "retry") {
        const succeeded = inputFor<boolean>("success", false);
        const error = inputFor<unknown>("error", "Operation failed");
        const stateKey = `__retry:${node.id}`;
        const attempt = Number(context.values[stateKey] || 0) + 1;
        output("attempt", attempt);
        output("error", error);
        try { output("parameters", JSON.parse(node.config.retryParameters || "{}")); }
        catch { throw new Error("Retry modified parameters must be valid JSON."); }
        if (succeeded) {
          delete context.values[stateKey];
          output("next", true);
          debugDetail = `Succeeded on attempt ${attempt}.`;
        } else if (attempt < (node.config.maxAttempts || 3)) {
          context.values[stateKey] = attempt;
          if ((node.config.delayMs || 0) > 0) await new Promise((resolve) => setTimeout(resolve, node.config.delayMs));
          output("retry", true);
          debugStatus = "routed";
          debugDetail = `Attempt ${attempt} failed; retrying.`;
        } else {
          delete context.values[stateKey];
          output("failed", true);
          debugStatus = "routed";
          debugDetail = `Stopped after ${attempt} attempts.`;
        }
      }

      if (node.type === "wait") {
        const delay = Math.max(0, node.config.delayMs || 1000);
        await new Promise((resolve) => setTimeout(resolve, delay));
        output("value", inputFor("value", promptInput));
        debugDetail = `Waited ${delay} ms.`;
      }

      if (node.type === "code") {
        const input = inputFor<unknown>("input", promptInput);
        const result = await executeCode(node, input, context);
        output("result", result);
        context.lastOutput = stringifyValue(result);
        debugDetail = `Executed ${node.config.codeLanguage || "javascript"} code.`;
      }

      if (node.type === "parser") {
        const parserDocumentInput = inputFor<FileAsset[] | FileAsset | undefined>("document", undefined);
        const documentAsset = Array.isArray(parserDocumentInput) ? parserDocumentInput[0] : parserDocumentInput;
        let text = String(inputFor<unknown>("source", promptInput));
        if (documentAsset?.data) {
          const encoded = documentAsset.data.split(",")[1] || "";
          try { text = atob(encoded); } catch { text = documentAsset.name; }
        }
        const data = parseStructuredText(text, node.config.parserFormat || "auto");
        output("data", data);
        output("text", text);
        context.lastOutput = stringifyValue(data);
        debugDetail = `Parsed input as ${node.config.parserFormat || "auto-detected data"}.`;
      }

      if (node.type === "join") {
        const values = inputFor<unknown[]>("values", []);
        let result: unknown = values;
        if (node.config.aggregateOperation === "concat") result = values.map(stringifyValue).join("");
        if (node.config.aggregateOperation === "sum") result = values.reduce<number>((sum, value) => sum + Number(value || 0), 0);
        if (node.config.aggregateOperation === "object") result = Object.fromEntries(values.map((value, index) => [String(index), value]));
        output("result", result);
        context.lastOutput = stringifyValue(result);
        debugDetail = `Aggregated ${values.length} input${values.length === 1 ? "" : "s"}.`;
      }

      if (node.type === "parallel") {
        const value = inputFor<unknown>("value", promptInput);
        output("value", value);
        debugDetail = "Passed the value to every connected branch.";
      }

      if (node.type === "router-condition") {
        const value = inputFor<unknown>("value", promptInput);
        const matched = conditionMatches(node, value, fileInput);
        output(matched ? "true" : "false", value);
        output("matched", matched);
        debugStatus = "routed";
        debugDetail = `Condition evaluated to ${matched}.`;
      }

      if (node.type === "router-rule") {
        const options = node.config.routeOptions?.length ? node.config.routeOptions : [{ id: "route-1", label: "Option 1", value: node.config.routeValue || "" }];
        const matchedOption = options.find((option) => evaluateRouteRule(node, String(promptInput), fileInput, option.value)) || options.at(-1)!;
        output(matchedOption.id, promptInput);
        debugStatus = "routed";
        debugDetail = `Rule chose ${matchedOption.label}.`;
      }

      if (node.type === "router-ai") {
        const options = node.config.routeOptions?.length ? node.config.routeOptions : [{ id: "route-1", label: "Option 1" }];
        const decision = await requestAI(
          {
            provider: node.config.provider || "openai",
            model: node.config.model || modelDefaults[node.config.provider || "openai"],
            temperature: 0,
            systemPrompt: `You are a routing classifier. Reply with only the option number from 1 to ${options.length}.`,
            prompt: `${node.config.routeCriteria || "Choose the best path."}\n\n${options.map((option, index) => `${index + 1}. ${option.label}`).join("\n")}\n\nInput:\n${String(promptInput)}`,
          },
          providerSettings,
        );
        const optionIndex = Math.max(0, Math.min(options.length - 1, Number(decision.match(/\d+/)?.[0] || 1) - 1));
        output(options[optionIndex].id, promptInput);
        debugStatus = "routed";
        debugDetail = `AI chose ${options[optionIndex].label}.`;
      }

      if (!isBuiltinNodeType(node.type)) {
        const definition = plugins
          .flatMap((plugin) => plugin.nodes)
          .find((candidate) => candidate.type === node.type);
        if (!definition) throw new Error(`The plug-in for “${node.name}” is not installed.`);
        const inputs = Object.fromEntries(
          nodeSchema.inputs
            .map((port) => [port.id, inputFor(port.id, undefined)]),
        );
        const result = await executePluginNode(
          definition,
          inputs,
          node.config.pluginConfig || {},
          context as unknown as Record<string, unknown>,
        );
        const dataOutputs = nodeSchema.outputs;
        if (Array.isArray(result)) {
          dataOutputs.forEach((port, index) => output(port.id, result[index]));
        } else if (result && typeof result === "object") {
          dataOutputs.forEach((port) => output(port.id, (result as Record<string, unknown>)[port.id]));
        } else if (dataOutputs[0]) {
          output(dataOutputs[0].id, result);
        }
        const firstResult = dataOutputs[0] ? context.values[portValueKey(node.id, dataOutputs[0].id)] : result;
        context.lastOutput = typeof firstResult === "string" ? firstResult : JSON.stringify(firstResult ?? "", null, 2);
        debugDetail = `Plug-in returned ${dataOutputs.length} typed output${dataOutputs.length === 1 ? "" : "s"}.`;
      }

      if (node.type === "end") {
        const finalPrompt = String(promptInput || context.lastOutput || context.loadedData || "Workflow complete.");
        updateDebugEvent(debugId, "completed", `Returned ${finalPrompt.length} prompt characters and ${fileInput.length} file${fileInput.length === 1 ? "" : "s"}.`, { outputs: [] });
        return { emittedPortKeys: [], endResult: { text: finalPrompt, files: fileInput } };
      }
      updateDebugEvent(debugId, debugStatus, debugDetail, { outputs: collectDebugOutputs() });
      return { emittedPortKeys: [...emittedPortKeys] };
  }

  async function runWorkflow(context: WorkflowContext, savedState: WorkflowRunState): Promise<void> {
    const start = activeWorkflow.nodes.find((node) => node.type === "start");
    if (!start) throw new Error("This workflow needs a Start node.");
    const reachable = new Set<string>([start.id]);
    const queue = [start.id];
    while (queue.length) {
      const sourceId = queue.shift()!;
      activeWorkflow.edges.filter((edge) => edge.from === sourceId).forEach((edge) => {
        if (!reachable.has(edge.to)) { reachable.add(edge.to); queue.push(edge.to); }
      });
    }

    const completed = new Set(savedState.completedNodeIds);
    const skipped = new Set(savedState.skippedNodeIds);
    const emitted = new Set(savedState.emittedPortKeys);
    const endResults = [...savedState.endResults];

    while (true) {
      const settled = new Set([...completed, ...skipped]);
      const pending = activeWorkflow.nodes.filter((node) => reachable.has(node.id) && !settled.has(node.id));
      if (!pending.length) break;
      const ready = pending.filter((node) => {
        const predecessors = activeWorkflow.edges
          .filter((edge) => edge.to === node.id && reachable.has(edge.from))
          .map((edge) => edge.from);
        return predecessors.every((id) => settled.has(id));
      });
      if (!ready.length) throw new Error("This workflow contains a cycle. Data-flow graphs must be acyclic.");

      const activeReady = ready.filter((node) => {
        const incoming = activeWorkflow.edges.filter((edge) => edge.to === node.id && reachable.has(edge.from));
        const activeIncoming = incoming.filter((edge) => emitted.has(portValueKey(edge.from, edge.fromPort || "")));
        if (!activeIncoming.length) return false;
        return getNodeSchema(node, plugins).inputs.every((port) => {
          const portEdges = incoming.filter((edge) => edge.toPort === port.id);
          return !portEdges.length || port.multiple || portEdges.some((edge) => activeIncoming.includes(edge));
        });
      });
      ready.filter((node) => !activeReady.includes(node)).forEach((node) => skipped.add(node.id));

      const waitingNode = activeReady.find((node) => node.type === "input");
      const executable = activeReady.filter((node) => node.type !== "input");
      const results = await Promise.all(executable.map(async (node) => ({
        node,
        result: await executeGraphNode(node, context, emitted),
      })));
      results.forEach(({ node, result }) => {
        completed.add(node.id);
        result.emittedPortKeys.forEach((key) => emitted.add(key));
        if (result.endResult) endResults.push(result.endResult);
      });

      if (waitingNode) {
        const resolvedWaitingNode = expandWorkflowSyntaxInValue(waitingNode, context.syntax);
        const debugInputs = getNodeSchema(resolvedWaitingNode, plugins).inputs.map((port) => ({
          port: port.id,
          label: port.label,
          type: port.type,
          value: undefined,
        }));
        addDebugEvent(resolvedWaitingNode, "waiting", resolvedWaitingNode.config.prompt || "Waiting for user input.", { inputs: debugInputs });
        setPendingInput({
          nodeId: waitingNode.id,
          context,
          runState: {
            completedNodeIds: [...completed],
            skippedNodeIds: [...skipped],
            emittedPortKeys: [...emitted],
            endResults,
          },
        });
        setMessages((current) => [...current, {
          id: uid("message"),
          role: "assistant",
          text: resolvedWaitingNode.config.prompt || "What additional information should I know?",
          time: timeNow(),
          meta: getStartSettings(activeWorkflow, context.syntax).agentName,
        }]);
        setIsRunning(false);
        return;
      }
    }

    setMessages((current) => [
      ...current,
      ...(endResults.length ? endResults.map((result) => ({
        id: uid("message"), role: "assistant" as const, text: result.text, time: timeNow(), meta: getStartSettings(activeWorkflow, context.syntax).agentName, files: result.files,
      })) : [{
        id: uid("message"), role: "assistant" as const, text: "Workflow finished without an End node.", time: timeNow(), meta: getStartSettings(activeWorkflow, context.syntax).agentName,
      }]),
    ]);
    setPendingInput(null);
    setIsRunning(false);
  }

  async function runNewWorkflowMessage(text: string, messageFiles: FileAsset[]) {
    setDebugEvents([]);
    const start = activeWorkflow.nodes.find((node) => node.type === "start");
    if (!start) throw new Error("This workflow needs a Start node.");
    const files = [...(activeWorkflow.files || []), ...messageFiles];
    const context: WorkflowContext = { userMessage: text, files, values: {}, syntax: syntaxContextFor() };
    context.values[portValueKey(start.id, "prompt")] = text;
    context.values[portValueKey(start.id, "files")] = files;
    context.values[portValueKey(start.id, "document")] = files.filter(isDocumentAsset);
    addDebugEvent(
      start,
      "completed",
      `Accepted ${text.length} prompt characters and ${files.length} file${files.length === 1 ? "" : "s"}.`,
      { outputs: [
        { port: "prompt", label: "prompt", type: "prompt", value: text },
        { port: "files", label: "files", type: "files", value: files },
      ] },
    );
    await runWorkflow(context, {
      completedNodeIds: [start.id],
      skippedNodeIds: [],
      emittedPortKeys: [portValueKey(start.id, "prompt"), portValueKey(start.id, "files"), portValueKey(start.id, "document")],
      endResults: [],
    });
  }

  function reportWorkflowRunError(error: unknown) {
    const detail = error instanceof Error ? error.message : "The workflow could not be completed.";
    setDebugEvents((current) => current.map((event) => event.status === "running" ? { ...event, status: "error", detail } : event));
    setMessages((current) => [
      ...current,
      {
        id: uid("message"),
        role: "system",
        text: detail,
        time: timeNow(),
        meta: "Action needed",
      },
    ]);
    setIsRunning(false);
  }

  async function resendMessage(message: Message) {
    if (message.role !== "user" || isRunning) return;
    const files = structuredClone(message.files || []);
    rememberChat();
    setEditingMessage(null);
    setPendingInput(null);
    const replacement: Message = {
      id: uid("message"), role: "user", text: message.text, time: timeNow(), files,
    };
    setMessages((current) => replaceWithResentBranch(
      current as BranchableMessage<Message>[],
      message.id,
      replacement,
    ) as Message[]);
    setIsRunning(true);
    try {
      await runNewWorkflowMessage(message.text, files);
    } catch (error) {
      reportWorkflowRunError(error);
    }
  }

  function switchMessageVersion(message: Message, targetIndex: number) {
    if (!message.branch || isRunning) return;
    rememberChat();
    setMessages((current) => switchResentBranch(
      current as BranchableMessage<Message>[],
      message.id,
      targetIndex,
    ) as Message[]);
    setPendingInput(null);
    setEditingMessage(null);
    setDebugEvents([]);
  }

  async function sendMessage() {
    const text = messageInput.trim() || (attachedFiles.length ? "Process the attached files." : "");
    if (!text || isRunning) return;
    rememberChat();
    setMessageInput("");
    setMessages((current) => [
      ...current,
      { id: uid("message"), role: "user", text, time: timeNow(), files: attachedFiles },
    ]);
    setIsRunning(true);

    try {
      if (pendingInput) {
        const messageFiles = [...pendingInput.context.files, ...attachedFiles];
        setDebugEvents((current) => {
          const lastWaiting = [...current].reverse().find((event) => event.status === "waiting");
          return current.map((event) => event.id === lastWaiting?.id ? {
            ...event,
            status: "completed",
            detail: `User supplied ${text.length} prompt characters and ${attachedFiles.length} file${attachedFiles.length === 1 ? "" : "s"}.`,
            outputs: [
              { port: "prompt", label: "prompt", type: "prompt", value: text },
              { port: "files", label: "files", type: "files", value: messageFiles },
            ],
          } : event);
        });
        const context = {
          ...pendingInput.context,
          additionalInput: text,
          files: messageFiles,
        };
        context.values[portValueKey(pendingInput.nodeId, "prompt")] = text;
        context.values[portValueKey(pendingInput.nodeId, "files")] = context.files;
        context.values[portValueKey(pendingInput.nodeId, "document")] = context.files.filter(isDocumentAsset);
        setAttachedFiles([]);
        const runState: WorkflowRunState = {
          ...pendingInput.runState,
          completedNodeIds: [...pendingInput.runState.completedNodeIds, pendingInput.nodeId],
          emittedPortKeys: [
            ...pendingInput.runState.emittedPortKeys,
            portValueKey(pendingInput.nodeId, "prompt"),
            portValueKey(pendingInput.nodeId, "files"),
            portValueKey(pendingInput.nodeId, "document"),
          ],
        };
        setPendingInput(null);
        await runWorkflow(context, runState);
      } else {
        const files = attachedFiles;
        setAttachedFiles([]);
        await runNewWorkflowMessage(text, files);
      }
    } catch (error) {
      reportWorkflowRunError(error);
    }
  }

  function switchWorkflow(id: string) {
    const workflow = workflows.find((item) => item.id === id);
    setActiveWorkflowId(id);
    if (workflow && !messages.some((message) => message.role === "user")) {
      setMessages(createStarterMessages(workflow, uid("message"), syntaxContextFor(workflow)));
    }
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
    setPendingInput(null);
  }

  function openWorkflowChat() {
    if (!messages.some((message) => message.role === "user")) {
      setMessages(createStarterMessages(activeWorkflow, uid("message"), syntaxContextFor()));
    }
    setTab("chat");
  }

  function renderChatSession(session: ChatSession) {
    const moveMenuOpen = moveMenuSessionId === session.id;
    return (
      <div className={`history-item ${session.id === activeSessionId ? "active" : ""} ${moveMenuOpen ? "menu-open" : ""}`} key={session.id}>
        {editingChatSession?.id === session.id ? (
          <div className="session-main session-edit">
            <MessageSquare size={15} />
            <input
              ref={chatSessionTitleInputRef}
              value={editingChatSession.title}
              onChange={(event) => setEditingChatSession({ ...editingChatSession, title: event.target.value })}
              onBlur={saveChatSessionRename}
              onKeyDown={(event) => {
                if (event.key === "Enter") saveChatSessionRename();
                if (event.key === "Escape") setEditingChatSession(null);
              }}
              aria-label="Chat session name"
            />
          </div>
        ) : (
          <button className="session-main" onClick={() => selectChatSession(session.id)}>
            <MessageSquare size={15} />
            <span><strong>{session.title}</strong><small>{workflows.find((workflow) => workflow.id === session.workflowId)?.name || "Workflow"}</small></span>
          </button>
        )}
        <span className="session-actions">
          <button onClick={() => setEditingChatSession({ id: session.id, title: session.title })} aria-label={`Rename ${session.title}`} title="Rename"><Pencil size={11} /></button>
          <button className={session.pinned ? "pinned" : ""} onClick={() => togglePinSession(session.id)} aria-label={`${session.pinned ? "Unpin" : "Pin"} ${session.title}`} title={session.pinned ? "Unpin" : "Pin"}><Pin size={11} fill={session.pinned ? "currentColor" : "none"} /></button>
          <button className={session.folderId ? "in-folder" : ""} onClick={() => setMoveMenuSessionId((current) => current === session.id ? null : session.id)} aria-expanded={moveMenuOpen} aria-label={`Move ${session.title} to folder`} title="Move to folder"><FolderOpen size={11} /></button>
          <button onClick={() => duplicateChatSession(session.id)} aria-label={`Duplicate ${session.title}`} title="Duplicate"><Copy size={11} /></button>
          <button onClick={() => deleteChatSession(session.id)} aria-label={`Delete ${session.title}`} title="Delete"><Trash2 size={11} /></button>
        </span>
        {moveMenuOpen && (
          <div className="session-folder-menu">
            <span>Move to folder</span>
            {session.folderId && <button onClick={() => moveChatSession(session.id, null)}><MessageSquare size={12} /> Chats</button>}
            {chatFolders.map((folder) => (
              <button className={session.folderId === folder.id ? "active" : ""} key={folder.id} onClick={() => moveChatSession(session.id, folder.id)} disabled={session.folderId === folder.id}>
                <FolderOpen size={12} /> {folder.name}{session.folderId === folder.id && <Check size={11} />}
              </button>
            ))}
            {!chatFolders.length && <button onClick={() => { setNewChatFolderName(""); setMoveMenuSessionId(null); }}><Plus size={12} /> Create a folder</button>}
          </div>
        )}
      </div>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <ConchMark />
          <div>
            <strong>Magic Conch</strong>
            <span>AI workflow studio</span>
          </div>
        </div>

        <nav className="tab-switcher" aria-label="Main views">
          <button className={tab === "chat" ? "active" : ""} onClick={openWorkflowChat}>
            <MessageSquare size={16} /> Chat
          </button>
          <button
            className={tab === "workflow" ? "active" : ""}
            onClick={() => setTab("workflow")}
          >
            <WorkflowIcon size={16} /> Workflow
          </button>
        </nav>

        <div className="top-actions">
          <span className="saved-state"><Check size={13} /> Saved</span>
          <button className="icon-button" aria-label="Settings" onClick={() => setSettingsOpen(true)}>
            <Settings size={18} />
          </button>
          <button className="avatar-button" aria-label="Account">MC</button>
        </div>
      </header>

      {tab === "workflow" ? (
        <section className="workflow-view">
          <aside className={`workflow-sidebar ${sidebarOpen ? "open" : ""}`}>
            <div className="sidebar-heading">
              <span>Workflows</span>
              <button className="mini-icon" aria-label="New workflow" onClick={newWorkflow}><Plus size={16} /></button>
            </div>
            <div className="workflow-list">
              {workflows.map((workflow) => (
                <div
                  key={workflow.id}
                  className={`workflow-list-item ${workflow.id === activeWorkflowId ? "active" : ""}`}
                >
                  {editingWorkflow?.id === workflow.id ? <div className="workflow-main-button"><span className="workflow-list-icon"><GitBranch size={16} /></span><input value={editingWorkflow.name} onChange={(event) => setEditingWorkflow({ ...editingWorkflow, name: event.target.value })} onBlur={saveWorkflowRename} onKeyDown={(event) => { if (event.key === "Enter") saveWorkflowRename(); if (event.key === "Escape") setEditingWorkflow(null); }} aria-label="Workflow name" /></div> : <button className="workflow-main-button" onClick={() => switchWorkflow(workflow.id)}><span className="workflow-list-icon"><GitBranch size={16} /></span><span><strong>{workflow.name}</strong><small>{workflow.nodes.length} nodes</small></span></button>}
                  <span className="workflow-item-actions"><button onClick={() => setEditingWorkflow({ id: workflow.id, name: workflow.name })} aria-label={`Rename ${workflow.name}`} title="Rename"><Pencil size={11} /></button><button onClick={() => duplicateWorkflow(workflow.id)} aria-label={`Duplicate ${workflow.name}`} title="Duplicate"><Copy size={11} /></button><button onClick={() => deleteWorkflow(workflow.id)} aria-label={`Delete ${workflow.name}`} title="Delete"><Trash2 size={11} /></button></span>
                </div>
              ))}
            </div>
            <div className="sidebar-divider" />
            <div className="sidebar-heading library-heading"><span>Node library</span></div>
            <div className="node-library">
              {(Object.keys(NODE_META) as BuiltinNodeType[]).map((type) => {
                const meta = NODE_META[type];
                const Icon = meta.icon;
                return (
                  <button key={type} onClick={() => addNode(type)}>
                    <span className="library-icon" style={{ "--node-color": meta.color } as React.CSSProperties}>
                      <Icon size={15} />
                    </span>
                    <span><strong>{meta.label}</strong><small>{meta.subtitle}</small></span>
                    <Plus size={14} className="add-icon" />
                  </button>
                );
              })}
              {plugins.flatMap((plugin) => plugin.nodes).map((definition) => {
                const meta = getNodeMeta(definition.type, plugins);
                const Icon = meta.icon;
                return (
                  <button key={definition.type} onClick={() => addNode(definition.type)}>
                    <span className="library-icon" style={{ "--node-color": meta.color } as React.CSSProperties}><Icon size={15} /></span>
                    <span><strong>{meta.label}</strong><small>{meta.subtitle}</small></span>
                    <Plus size={14} className="add-icon" />
                  </button>
                );
              })}
            </div>
            <details className="syntax-reference">
              <summary><span><Braces size={14} /> Syntax</span><ChevronDown size={14} /></summary>
              <div className="syntax-reference-body">
                <p>Use these tokens in workflow text fields. They resolve when a run starts.</p>
                <div className="syntax-list">
                  {WORKFLOW_SYNTAX.map((item) => (
                    <button key={item.token} onClick={() => { navigator.clipboard?.writeText(item.token); showToast(`${item.token} copied`); }} title={`Copy ${item.token}`}>
                      <code>{item.token}</code><small>{item.description}</small>
                    </button>
                  ))}
                </div>
              </div>
            </details>
            <div className="sidebar-footer">
              <button onClick={() => fileInputRef.current?.click()}><Upload size={15} /> Import JSON</button>
              <button onClick={exportWorkflow}><Download size={15} /> Export</button>
              <input ref={fileInputRef} type="file" accept="application/json,.json" hidden onChange={importWorkflow} />
            </div>
          </aside>

          <div className="workflow-main">
            <div className="workflow-toolbar">
              <button className="mobile-menu" onClick={() => setSidebarOpen((open) => !open)} aria-label="Toggle menu"><Menu size={18} /></button>
              <div className="workflow-title-wrap">
                <input
                  className="workflow-title"
                  value={activeWorkflow.name}
                  onChange={(event) => updateWorkflow((workflow) => ({ ...workflow, name: event.target.value }))}
                  aria-label="Workflow name"
                />
                <span>Edited just now</span>
              </div>
              <div className="workflow-toolbar-actions">
                <button className="icon-button" onClick={undoWorkflow} aria-label="Undo last workflow change" title="Undo (Ctrl+Z)"><Undo2 size={16} /></button>
                <button className="icon-button" onClick={redoWorkflow} aria-label="Redo workflow change" title="Redo (Ctrl+Shift+Z)"><Redo2 size={16} /></button>
                <button className="secondary-button" onClick={() => workflowAssetInputRef.current?.click()}><Paperclip size={15} /> Files {activeWorkflow.files?.length ? `(${activeWorkflow.files.length})` : ""}</button>
                <button className="secondary-button" onClick={saveWorkflow}><Save size={15} /> Save</button>
                <button className="primary-button" onClick={openWorkflowChat}><Play size={15} fill="currentColor" /> Test workflow</button>
                <button className="icon-button hide-mobile" aria-label="More options"><MoreHorizontal size={18} /></button>
                <input ref={workflowAssetInputRef} type="file" multiple hidden onChange={addWorkflowFiles} />
              </div>
            </div>

            <div
              className={`canvas ${connectionSource ? "connecting" : ""}`}
              ref={canvasRef}
              onPointerDown={beginPan}
              onPointerMove={movePointer}
              onPointerUp={finishPointer}
              onPointerCancel={finishPointer}
              onLostPointerCapture={finishPointer}
              onWheel={zoomCanvasWithWheel}
            >
              <div className="canvas-hint"><MousePointer2 size={13} /> Drag to select · Shift-click adds · Alt-drag pans · Scroll to zoom</div>
              {selectionBox && <div className="selection-box" style={{ left: selectionBox.x, top: selectionBox.y, width: selectionBox.width, height: selectionBox.height }} />}
              <div
                className="canvas-scene"
                style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
              >
                <svg className="edges" width="1800" height="900" aria-label="Workflow connections">
                  {activeWorkflow.edges.map((edge) => {
                    const from = activeWorkflow.nodes.find((node) => node.id === edge.from);
                    const to = activeWorkflow.nodes.find((node) => node.id === edge.to);
                    if (!from || !to) return null;
                    const start = portPoint(from, edge.fromPort || "", "output", plugins);
                    const end = portPoint(to, edge.toPort || "", "input", plugins);
                    const x1 = start.x;
                    const y1 = start.y;
                    const x2 = end.x;
                    const y2 = end.y;
                    const curve = Math.max(70, Math.abs(x2 - x1) * 0.45);
                    const path = `M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`;
                    return (
                      <g key={edge.id} className={`edge-group edge-${edge.dataType || "any"}`}>
                        <path className="edge-line" d={path} />
                        <path
                          className="edge-hit"
                          d={path}
                          role="button"
                          tabIndex={0}
                          aria-label={`Disconnect ${edge.dataType || "any"} connection`}
                          onClick={() => removeEdge(edge.id)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === "Delete") removeEdge(edge.id);
                          }}
                        />
                      </g>
                    );
                  })}
                  {connectionSource && connectionDraft && (() => {
                    const from = activeWorkflow.nodes.find((node) => node.id === connectionSource.nodeId);
                    if (!from) return null;
                    const start = portPoint(from, connectionSource.portId, "output", plugins);
                    const x1 = start.x;
                    const y1 = start.y;
                    const curve = Math.max(70, Math.abs(connectionDraft.x - x1) * 0.45);
                    return <path className={`draft-edge edge-${connectionSource.dataType}`} d={`M ${x1} ${y1} C ${x1 + curve} ${y1}, ${connectionDraft.x - curve} ${connectionDraft.y}, ${connectionDraft.x} ${connectionDraft.y}`} />;
                  })()}
                </svg>
                {activeWorkflow.nodes.map((node) => {
                  const meta = getNodeMeta(node.type, plugins);
                  const Icon = meta.icon;
                  const schema = getNodeSchema(node, plugins);
                  return (
                    <article
                      key={node.id}
                      className={`flow-node ${selectedNodeIds.includes(node.id) ? "selected" : ""}`}
                      style={{ left: node.x, top: node.y, height: nodeCardHeight(node, plugins), "--node-color": meta.color } as React.CSSProperties}
                      onPointerDown={(event) => beginNodeDrag(event, node)}
                    >
                      <div className="node-topline" />
                      <div className="node-header">
                        <span className="node-icon"><Icon size={17} /></span>
                        <span className="node-text">
                          <strong>{node.name}</strong>
                          <small>{node.type === "request" || node.type === "router-ai" ? `${node.config.provider || "openai"} · ${node.config.model || "model"}` : meta.subtitle}</small>
                        </span>
                      </div>
                      <div className="node-ports">
                        <div className="port-column input-column">
                          {schema.inputs.map((port) => {
                            const connected = activeWorkflow.edges.some((edge) => edge.to === node.id && edge.toPort === port.id);
                            return <div className="port-row" key={port.id}><button className={`typed-port input-port type-${port.type} ${connected ? "connected" : ""}`} data-input-node={node.id} data-input-port={port.id} data-input-type={port.type} aria-label={`${port.label} ${port.type} input`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); connectTo(node.id, port.id, port.type); }} /><span><b>{port.label}</b><small>{port.type}</small></span>{connected && <button className="disconnect-port" aria-label={`Disconnect ${port.label}`} title="Disconnect" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); disconnectInput(node.id, port.id); }}><X size={10} /></button>}</div>;
                          })}
                        </div>
                        <div className="port-column output-column">
                          {schema.outputs.map((port) => <div className="port-row" key={port.id}><span><b>{port.label}</b><small>{port.type}</small></span><button className={`typed-port output-port type-${port.type} ${connectionSource?.nodeId === node.id && connectionSource.portId === port.id ? "active" : ""}`} aria-label={`${port.label} ${port.type} output`} onPointerDown={(event) => beginConnection(event, node.id, port)} /></div>)}
                        </div>
                      </div>
                      {(node.type === "router-ai" || node.type === "router-rule") && <button className="route-add-button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); addRouteOption(node.id); }}><Plus size={11} /> Add new route</button>}
                    </article>
                  );
                })}
              </div>

              <div className="zoom-controls">
                <button aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(0.55, value - 0.1))}><ZoomOut size={16} /></button>
                <span>{Math.round(zoom * 100)}%</span>
                <button aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(1.35, value + 0.1))}><ZoomIn size={16} /></button>
                <button aria-label="Reset canvas" onClick={() => { setZoom(0.9); setPan({ x: 0, y: 28 }); }}><RotateCcw size={15} /></button>
              </div>
            </div>
          </div>

          {inspectorOpen && (
            <aside className="inspector">
              <div className="inspector-heading">
                <div><span className="eyebrow">Inspector</span><strong>{selectedNode ? "Node settings" : "Workflow settings"}</strong></div>
                <button className="mini-icon" onClick={() => setInspectorOpen(false)} aria-label="Close inspector"><PanelRightClose size={17} /></button>
              </div>
              {selectedNode ? (
                <div className="inspector-content">
                  <div className="selected-type">
                    <span className="library-icon" style={{ "--node-color": selectedMeta?.color } as React.CSSProperties}>
                      {(() => { const Icon = selectedMeta?.icon || Plug; return <Icon size={16} />; })()}
                    </span>
                    <span><strong>{selectedMeta?.label}</strong><small>{selectedNode.id}</small></span>
                  </div>
                  <label className="field-label">Name<input value={selectedNode.name} onChange={(event) => updateNode({ name: event.target.value })} /></label>
                  {selectedNode.type === "start" && (
                    <>
                      <label className="field-label">Agent name<input value={selectedNode.config.agentName || ""} placeholder={DEFAULT_AGENT_NAME} onChange={(event) => updateNode({ config: { agentName: event.target.value } })} /><small className="field-help">Shown beside every message sent by this workflow.</small></label>
                      <label className="field-label">Start message<textarea rows={4} value={selectedNode.config.startMessage || ""} placeholder={DEFAULT_START_MESSAGE} onChange={(event) => updateNode({ config: { startMessage: event.target.value } })} /><small className="field-help">Shown when a new chat starts or this workflow is opened for testing.</small></label>
                    </>
                  )}
                  {selectedNode.type === "input" && (
                    <label className="field-label">Question<textarea rows={4} value={selectedNode.config.prompt || ""} onChange={(event) => updateNode({ config: { prompt: event.target.value } })} /></label>
                  )}
                  {selectedNode.type === "set-state" && <>
                    <label className="field-label">Variable name<input value={selectedNode.config.variableName || ""} placeholder="result" onChange={(event) => updateNode({ config: { variableName: event.target.value } })} /></label>
                    <label className="field-label">Value type<div className="select-wrap"><select value={selectedNode.config.valueType || "text"} onChange={(event) => updateNode({ config: { valueType: event.target.value as FlowNode["config"]["valueType"] } })}><option value="text">Text</option><option value="number">Number</option><option value="boolean">Boolean</option><option value="json">JSON</option></select><ChevronDown size={14} /></div></label>
                    <label className="field-label">Fallback value<textarea rows={3} value={selectedNode.config.stateValue || ""} onChange={(event) => updateNode({ config: { stateValue: event.target.value } })} /><small className="field-help">Used when the value port is not connected.</small></label>
                  </>}
                  {selectedNode.type === "transform" && <>
                    <label className="field-label">Operation<div className="select-wrap"><select value={selectedNode.config.transformOperation || "json_parse"} onChange={(event) => updateNode({ config: { transformOperation: event.target.value as FlowNode["config"]["transformOperation"] } })}><option value="json_parse">Parse JSON</option><option value="extract">Extract field</option><option value="template">Format string</option><option value="regex">Regex replace</option><option value="map">Map array</option><option value="filter">Filter array</option></select><ChevronDown size={14} /></div></label>
                    {(["extract", "map", "filter"] as const).includes(selectedNode.config.transformOperation as "extract") && <label className="field-label">Field path<input value={selectedNode.config.path || ""} placeholder="user.profile.name" onChange={(event) => updateNode({ config: { path: event.target.value } })} /></label>}
                    {selectedNode.config.transformOperation === "template" && <label className="field-label">Template<textarea rows={3} value={selectedNode.config.template || ""} placeholder="Hello {{value.name}}" onChange={(event) => updateNode({ config: { template: event.target.value } })} /></label>}
                    {(selectedNode.config.transformOperation === "regex" || selectedNode.config.transformOperation === "filter") && <><label className="field-label">{selectedNode.config.transformOperation === "regex" ? "Pattern" : "Contains"}<input value={selectedNode.config.pattern || ""} onChange={(event) => updateNode({ config: { pattern: event.target.value } })} /></label><label className="field-label">{selectedNode.config.transformOperation === "regex" ? "Replacement" : "Match value"}<input value={selectedNode.config.replacement || ""} onChange={(event) => updateNode({ config: { replacement: event.target.value } })} /></label></>}
                  </>}
                  {selectedNode.type === "retry" && <><label className="field-label">Maximum attempts<input type="number" min="1" max="100" value={selectedNode.config.maxAttempts || 3} onChange={(event) => updateNode({ config: { maxAttempts: Math.max(1, Number(event.target.value)) } })} /></label><label className="field-label">Delay (milliseconds)<input type="number" min="0" value={selectedNode.config.delayMs || 0} onChange={(event) => updateNode({ config: { delayMs: Math.max(0, Number(event.target.value)) } })} /></label><label className="field-label">Modified parameters (JSON)<textarea rows={4} className="code-editor" value={selectedNode.config.retryParameters || "{}"} onChange={(event) => updateNode({ config: { retryParameters: event.target.value } })} /><small className="field-help">Emitted on each retry so the retried branch can adjust its request.</small></label></>}
                  {selectedNode.type === "wait" && <label className="field-label">Delay (milliseconds)<input type="number" min="0" value={selectedNode.config.delayMs || 0} onChange={(event) => updateNode({ config: { delayMs: Math.max(0, Number(event.target.value)) } })} /><small className="field-help">Useful for rate limits, polling, and asynchronous APIs.</small></label>}
                  {selectedNode.type === "code" && <><label className="field-label">Language<div className="select-wrap"><select value={selectedNode.config.codeLanguage || "javascript"} onChange={(event) => updateNode({ config: { codeLanguage: event.target.value as "javascript" | "python" } })}><option value="javascript">JavaScript</option><option value="python">Python (Pyodide)</option></select><ChevronDown size={14} /></div></label><label className="field-label">Code<textarea className="code-editor" rows={10} spellCheck={false} value={selectedNode.config.code || ""} onChange={(event) => updateNode({ config: { code: event.target.value } })} /><small className="field-help">Use input and context. JavaScript should return a value; Python returns its final expression.</small></label></>}
                  {selectedNode.type === "parser" && <label className="field-label">Format<div className="select-wrap"><select value={selectedNode.config.parserFormat || "auto"} onChange={(event) => updateNode({ config: { parserFormat: event.target.value as FlowNode["config"]["parserFormat"] } })}><option value="auto">Auto detect</option><option value="json">JSON</option><option value="xml">XML</option><option value="csv">CSV</option><option value="yaml">YAML</option><option value="markdown">Markdown</option></select><ChevronDown size={14} /></div></label>}
                  {selectedNode.type === "join" && <label className="field-label">Aggregation<div className="select-wrap"><select value={selectedNode.config.aggregateOperation || "array"} onChange={(event) => updateNode({ config: { aggregateOperation: event.target.value as FlowNode["config"]["aggregateOperation"] } })}><option value="array">Collect as array</option><option value="object">Collect as object</option><option value="concat">Concatenate text</option><option value="sum">Sum numbers</option></select><ChevronDown size={14} /></div></label>}
                  {selectedNode.type === "router-condition" && <><label className="field-label">Condition<div className="select-wrap"><select value={selectedNode.config.conditionKind || "truthy"} onChange={(event) => updateNode({ config: { conditionKind: event.target.value as FlowNode["config"]["conditionKind"] } })}><option value="truthy">Value is truthy</option><option value="equals">Value equals</option><option value="contains">Value contains</option><option value="input_type">Input type is</option><option value="file_extension">File extension is</option></select><ChevronDown size={14} /></div></label>{selectedNode.config.conditionKind !== "truthy" && <label className="field-label">Expected value<input value={selectedNode.config.conditionValue || ""} placeholder={selectedNode.config.conditionKind === "file_extension" ? "pdf" : selectedNode.config.conditionKind === "input_type" ? "document, boolean, array…" : "value"} onChange={(event) => updateNode({ config: { conditionValue: event.target.value } })} /></label>}</>}
                  {(selectedNode.type === "request" || selectedNode.type === "router-ai") && (
                    <>
                      <label className="field-label">Provider
                        <div className="select-wrap"><select value={selectedNode.config.provider || "openai"} onChange={(event) => {
                          const provider = event.target.value as AIProvider;
                          updateNode({ config: { provider, model: modelDefaults[provider] } });
                        }}><option value="openai">OpenAI</option><option value="gemini">Google Gemini</option><option value="claude">Anthropic Claude</option><option value="ollama">Ollama</option></select><ChevronDown size={14} /></div>
                      </label>
                      <label className="field-label">
                        <span className="field-title-row">Model {selectedNode.config.provider === "ollama" && <button type="button" onClick={loadOllamaModels} disabled={ollamaLoading}><RefreshCw size={12} className={ollamaLoading ? "spin" : ""} /> Load installed</button>}</span>
                        <input list={selectedNode.config.provider === "ollama" ? "ollama-models" : undefined} value={selectedNode.config.model || ""} onChange={(event) => updateNode({ config: { model: event.target.value } })} />
                        {selectedNode.config.provider === "ollama" && <datalist id="ollama-models">{ollamaModels.map((model) => <option key={model} value={model} />)}</datalist>}
                      </label>
                      {selectedNode.type === "request" ? <>
                        <label className="field-label">System prompt<textarea rows={5} value={selectedNode.config.systemPrompt || ""} placeholder="Describe how the model should behave…" onChange={(event) => updateNode({ config: { systemPrompt: event.target.value } })} /></label>
                        <label className="field-label">Create file from response<input value={selectedNode.config.outputFileName || ""} placeholder="Optional, e.g. report.md" onChange={(event) => updateNode({ config: { outputFileName: event.target.value } })} /><small className="field-help">When set, the response becomes a workflow file that Save nodes can write.</small></label>
                      </> : <>
                        <label className="field-label">Routing criteria<textarea rows={4} value={selectedNode.config.routeCriteria || ""} placeholder="Describe when to choose path A or B…" onChange={(event) => updateNode({ config: { routeCriteria: event.target.value } })} /></label>
                      </>}
                      <label className="field-label range-label"><span>Temperature <b>{selectedNode.config.temperature ?? 0.7}</b></span><input type="range" min="0" max="2" step="0.1" value={selectedNode.config.temperature ?? 0.7} onChange={(event) => updateNode({ config: { temperature: Number(event.target.value) } })} /></label>
                    </>
                  )}
                  {selectedNode.type === "router-rule" && (
                    <>
                      <label className="field-label">Rule method<div className="select-wrap"><select value={selectedNode.config.routeMethod || "contains"} onChange={(event) => updateNode({ config: { routeMethod: event.target.value as FlowNode["config"]["routeMethod"] } })}><option value="contains">Contains text</option><option value="not_contains">Does not contain text</option><option value="equals">Equals text</option><option value="starts_with">Starts with</option><option value="ends_with">Ends with</option><option value="regex">Regular expression</option><option value="length_gt">Text length greater than</option><option value="length_lt">Text length less than</option><option value="is_empty">Is empty</option><option value="file_type">Has file type</option><option value="file_count_gt">File count greater than</option><option value="number_gt">Number greater than</option><option value="number_lt">Number less than</option></select><ChevronDown size={14} /></div></label>
                      <label className="check-field"><input type="checkbox" checked={selectedNode.config.caseSensitive || false} onChange={(event) => updateNode({ config: { caseSensitive: event.target.checked } })} /><span>Case-sensitive text matching</span></label>
                    </>
                  )}
                  {(selectedNode.type === "router-ai" || selectedNode.type === "router-rule") && <div className="route-options-editor"><span className="field-title-row"><b>Route outputs</b><button type="button" onClick={() => addRouteOption(selectedNode.id)}><Plus size={12} /> Add option</button></span>{(selectedNode.config.routeOptions || [{ id: "route-1", label: "Option 1", value: selectedNode.config.routeValue || "" }]).map((option, index, options) => <div className="route-option-row" key={option.id}><span>{index + 1}</span><div><input aria-label={`Option ${index + 1} label`} value={option.label} onChange={(event) => updateNode({ config: { routeOptions: options.map((item) => item.id === option.id ? { ...item, label: event.target.value } : item) } })} />{selectedNode.type === "router-rule" && selectedNode.config.routeMethod !== "is_empty" && <input aria-label={`${option.label} match value`} className="route-value-input" value={option.value || ""} placeholder="Match value" onChange={(event) => updateNode({ config: { routeOptions: options.map((item) => item.id === option.id ? { ...item, value: event.target.value } : item) } })} />}</div><button className="mini-icon route-option-delete" disabled={options.length <= 1} aria-label={options.length <= 1 ? "At least one route option is required" : `Remove ${option.label}`} title={options.length <= 1 ? "At least one output is required" : "Delete output"} onClick={() => removeRouteOption(selectedNode.id, option.id)}><Trash2 size={13} /></button></div>)}<small>Connecting the last output automatically creates the next one.</small></div>}
                  {(selectedNode.type === "save" || selectedNode.type === "load") && (
                    <>
                      <label className="field-label">File key<input value={selectedNode.config.key || ""} placeholder="record-name" onChange={(event) => updateNode({ config: { key: event.target.value } })} /><small className="field-help">Versioned files with the same key can coexist.</small></label>
                      <label className="field-label">Subfolder path<input value={selectedNode.config.subfolder || ""} placeholder="./bla/blaba" onChange={(event) => updateNode({ config: { subfolder: event.target.value } })} /><small className="field-help">Relative to the directory below. Save creates missing folders; Load reads existing folders.</small></label>
                      <div className="node-folder-picker"><span><FolderOpen size={15} /><span><strong>Node directory</strong><small>{selectedNode.config.directoryName || databaseFolder?.name || "Use workspace database folder"}</small></span></span><button className="secondary-button" onClick={() => chooseFolder("node", selectedNode.id)}>Choose</button></div>
                      {selectedNode.type === "save" ? (
                        <>
                          <label className="field-label">When a name already exists<div className="select-wrap"><select value={selectedNode.config.collision || "increment"} onChange={(event) => updateNode({ config: { collision: event.target.value as FlowNode["config"]["collision"] } })}><option value="increment">Add number (file-2)</option><option value="timestamp">Add timestamp</option><option value="overwrite">Overwrite</option></select><ChevronDown size={14} /></div></label>
                          <label className="field-label">Save<div className="select-wrap"><select value={selectedNode.config.saveFiles || "both"} onChange={(event) => updateNode({ config: { saveFiles: event.target.value as FlowNode["config"]["saveFiles"] } })}><option value="both">Data and files</option><option value="data">Data only</option><option value="files">Files only</option></select><ChevronDown size={14} /></div></label>
                        </>
                      ) : (
                        <label className="field-label">When multiple files match<div className="select-wrap"><select value={selectedNode.config.loadMode || "latest"} onChange={(event) => updateNode({ config: { loadMode: event.target.value as FlowNode["config"]["loadMode"] } })}><option value="latest">Load newest</option><option value="all">Load all</option><option value="exact">Exact name only</option></select><ChevronDown size={14} /></div></label>
                      )}
                    </>
                  )}
                  {selectedPluginNode && (
                    <div className="plugin-fields">
                      {(selectedPluginNode.fields || []).map((field) => (
                        <label className="field-label" key={field.key}>{field.label}
                          {field.type === "textarea" ? (
                            <textarea rows={4} value={String(selectedNode.config.pluginConfig?.[field.key] ?? field.default ?? "")} onChange={(event) => updateNode({ config: { pluginConfig: { ...(selectedNode.config.pluginConfig || {}), [field.key]: event.target.value } } })} />
                          ) : field.type === "select" ? (
                            <div className="select-wrap"><select value={String(selectedNode.config.pluginConfig?.[field.key] ?? field.default ?? "")} onChange={(event) => updateNode({ config: { pluginConfig: { ...(selectedNode.config.pluginConfig || {}), [field.key]: event.target.value } } })}>{(field.options || []).map((option) => <option key={option} value={option}>{option}</option>)}</select><ChevronDown size={14} /></div>
                          ) : (
                            <input type={field.type === "number" ? "number" : "text"} value={String(selectedNode.config.pluginConfig?.[field.key] ?? field.default ?? "")} onChange={(event) => updateNode({ config: { pluginConfig: { ...(selectedNode.config.pluginConfig || {}), [field.key]: field.type === "number" ? Number(event.target.value) : event.target.value } } })} />
                          )}
                        </label>
                      ))}
                    </div>
                  )}
                  <div className="inspector-note"><Info size={15} /><span>Changes are saved automatically to this browser.</span></div>
                  <button className="danger-button" onClick={deleteSelectedNode}><Trash2 size={15} /> Delete {selectedNodeIds.length > 1 ? `${selectedNodeIds.length} nodes` : "node"}</button>
                </div>
              ) : (
                <div className="inspector-content empty-inspector">
                  <Box size={28} />
                  <strong>Select a node</strong>
                  <p>Choose a node on the canvas to edit its name and settings.</p>
                </div>
              )}
            </aside>
          )}
          {!inspectorOpen && <button className="reopen-inspector" onClick={() => setInspectorOpen(true)}><Settings size={16} /> Inspector</button>}
        </section>
      ) : (
        <section
          className={`chat-view ${debugOpen ? "debug-open" : ""} ${isDraggingFiles ? "dragging-files" : ""}`}
          onDragEnter={handleChatDragEnter}
          onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
          onDragLeave={handleChatDragLeave}
          onDrop={handleChatDrop}
        >
          {isDraggingFiles && <div className="file-drop-overlay"><span><Upload size={24} /><strong>Drop files into this chat</strong><small>They’ll be attached to your next message.</small></span></div>}
          <aside className={`chat-sidebar ${sidebarOpen ? "open" : ""}`}>
            <div className="chat-sidebar-actions">
              <button className="new-chat-button" onClick={createChatSession}><Plus size={16} /> New chat</button>
              <button className="new-folder-button" onClick={() => { setNewChatFolderName(""); setEditingChatFolder(null); }} aria-label="Create chat folder" title="Create folder"><FolderOpen size={16} /><Plus size={9} /></button>
            </div>
            {newChatFolderName !== null && (
              <div className="new-folder-form">
                <FolderOpen size={15} />
                <input
                  ref={chatFolderNameInputRef}
                  value={newChatFolderName}
                  onChange={(event) => setNewChatFolderName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") createChatFolder();
                    if (event.key === "Escape") setNewChatFolderName(null);
                  }}
                  placeholder="Folder name"
                  aria-label="New chat folder name"
                />
                <button onClick={createChatFolder} aria-label="Save chat folder"><Check size={12} /></button>
                <button onClick={() => setNewChatFolderName(null)} aria-label="Cancel folder creation"><X size={12} /></button>
              </div>
            )}
            <div className="chat-side-section">
              {!!unfiledChatSessions.length && (
                <div className="chat-group" role="group" aria-label="Chats without a folder">
                  <span className="eyebrow">Chats <small>{unfiledChatSessions.length}</small></span>
                  {unfiledChatSessions.map(renderChatSession)}
                </div>
              )}
              {chatFolders.map((folder) => {
                const folderSessions = sortedChatSessions.filter((session) => session.folderId === folder.id);
                return (
                  <div className="chat-folder" key={folder.id} role="group" aria-label={`${folder.name} folder`}>
                    <div className="chat-folder-heading">
                      {editingChatFolder?.id === folder.id ? (
                        <div className="chat-folder-edit">
                          <FolderOpen size={14} />
                          <input
                            ref={chatFolderNameInputRef}
                            value={editingChatFolder.name}
                            onChange={(event) => setEditingChatFolder({ ...editingChatFolder, name: event.target.value })}
                            onBlur={saveChatFolderRename}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") saveChatFolderRename();
                              if (event.key === "Escape") setEditingChatFolder(null);
                            }}
                            aria-label="Chat folder name"
                          />
                        </div>
                      ) : (
                        <button className="chat-folder-main" onClick={() => toggleChatFolder(folder.id)} aria-expanded={!folder.collapsed}>
                          {folder.collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                          <FolderOpen size={14} />
                          <strong>{folder.name}</strong>
                          <small>{folderSessions.length}</small>
                        </button>
                      )}
                      <span className="folder-actions">
                        <button onClick={() => { setEditingChatFolder({ id: folder.id, name: folder.name }); setNewChatFolderName(null); }} aria-label={`Rename ${folder.name} folder`} title="Rename folder"><Pencil size={11} /></button>
                        <button onClick={() => removeChatFolder(folder.id)} aria-label={`Remove ${folder.name} folder`} title="Remove folder"><Trash2 size={11} /></button>
                      </span>
                    </div>
                    {!folder.collapsed && (
                      <div className="chat-folder-sessions">
                        {folderSessions.length ? folderSessions.map(renderChatSession) : <span className="empty-folder">Move chats here using the folder icon.</span>}
                      </div>
                    )}
                  </div>
                );
              })}
              {!unfiledChatSessions.length && !chatFolders.length && <span className="empty-folder standalone">No chats yet.</span>}
            </div>
            <div className="chat-sidebar-bottom">
              <div className="storage-card">
                <span className="storage-icon"><HardDrive size={16} /></span>
                <div><strong>Local database</strong><small>{databaseFolder ? databaseFolder.name : "Browser storage"}</small></div>
                <span className={`status-dot ${databaseFolder ? "connected" : ""}`} />
              </div>
              <button onClick={() => setSettingsOpen(true)}><Settings size={16} /> Settings</button>
            </div>
          </aside>
          <div className="chat-main">
            <div className="chat-header">
              <button className="mobile-menu" onClick={() => setSidebarOpen((open) => !open)} aria-label="Toggle chats"><Menu size={19} /></button>
              <div className="chat-title"><strong>{getStartSettings(activeWorkflow, syntaxContextFor()).agentName}</strong><span><i /> Ready</span></div>
              <div className="chat-header-actions">
                <button className="icon-button" onClick={undoChat} disabled={!chatUndoRef.current.length || isRunning} aria-label="Undo chat change" title="Undo chat change"><Undo2 size={16} /></button>
                <button className="icon-button" onClick={redoChat} disabled={!chatRedoRef.current.length || isRunning} aria-label="Redo chat change" title="Redo chat change"><Redo2 size={16} /></button>
                <button className={`debug-toggle ${debugOpen ? "active" : ""}`} onClick={() => setDebugOpen((open) => !open)} aria-label={`${debugOpen ? "Close" : "Open"} workflow debugger`}><Bug size={15} /><span>Debug</span>{debugOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}</button>
                <label className="workflow-select-label"><WorkflowIcon size={15} /><span>Workflow</span><div className="select-wrap compact"><select value={activeWorkflowId} onChange={(event) => switchWorkflow(event.target.value)}>{workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name}</option>)}</select><ChevronDown size={14} /></div></label>
              </div>
            </div>
            <div className="messages" ref={scrollRef}>
              <div className="conversation-date"><span>Today</span></div>
              {messages.map((message) => (
                <div key={message.id} className={`message-row ${message.role}`}>
                  <div className="message-avatar">{message.role === "user" ? "YOU" : message.role === "system" ? <Info size={17} /> : <ConchMark small />}</div>
                  <div className="message-block">
                    <div className="message-meta"><strong>{message.role === "user" ? "You" : message.meta || "Magic Conch"}</strong><span>{message.time}</span>{message.role === "user" && !isRunning && <><button className="edit-message-button" onClick={() => resendMessage(message)} aria-label="Resend message" title="Run this message again"><Redo2 size={11} /> Resend</button><button className="edit-message-button" onClick={() => setEditingMessage({ id: message.id, text: message.text })} aria-label="Edit message"><Pencil size={11} /> Edit</button></>}{message.role === "user" && message.branch && <span className="message-version-controls" aria-label="Message versions"><button disabled={isRunning || message.branch.activeIndex === 0} onClick={() => switchMessageVersion(message, message.branch!.activeIndex - 1)} aria-label="Show previous message version" title="Previous version"><ChevronLeft size={11} /></button><span>{message.branch.activeIndex + 1} / {message.branch.versions.length}</span><button disabled={isRunning || message.branch.activeIndex === message.branch.versions.length - 1} onClick={() => switchMessageVersion(message, message.branch!.activeIndex + 1)} aria-label="Show next message version" title="Next version"><ChevronRight size={11} /></button></span>}</div>
                    {editingMessage?.id === message.id ? <div className="message-editor"><textarea value={editingMessage.text} onChange={(event) => setEditingMessage({ ...editingMessage, text: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) saveEditedMessage(); if (event.key === "Escape") setEditingMessage(null); }} /><div><button onClick={() => setEditingMessage(null)}>Cancel</button><button className="save-edit" onClick={saveEditedMessage}><Check size={12} /> Save</button></div></div> : <div className="message-bubble message-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown></div>}
                    {!!message.files?.length && <div className="message-files">{message.files.map((file, index) => <span key={`${file.name}-${index}`}><FileJson size={12} /> {file.name}<small>{Math.max(1, Math.round(file.size / 1024))} KB</small></span>)}</div>}
                  </div>
                </div>
              ))}
              {isRunning && (
                <div className="message-row assistant">
                  <div className="message-avatar"><ConchMark small /></div>
                  <div className="message-block"><div className="message-meta"><strong>{getStartSettings(activeWorkflow, syntaxContextFor()).agentName}</strong><span>Running workflow</span></div><div className="message-bubble typing"><i /><i /><i /></div></div>
                </div>
              )}
            </div>
            <div className="composer-wrap">
              <div className="active-workflow-pill"><Sparkles size={13} /> {pendingInput ? "Waiting for your answer" : `${activeWorkflow.nodes.length} nodes ready`}</div>
              {!!attachedFiles.length && <div className="attachment-tray">{attachedFiles.map((file, index) => <span key={`${file.name}-${index}`}><FileJson size={12} /> {file.name}<button aria-label={`Remove ${file.name}`} onClick={() => setAttachedFiles((files) => files.filter((_, itemIndex) => itemIndex !== index))}><X size={11} /></button></span>)}</div>}
              <div className="composer">
                <button className="attach-button" onClick={() => attachmentInputRef.current?.click()} aria-label="Attach files"><Paperclip size={17} /></button>
                <input ref={attachmentInputRef} type="file" multiple hidden onChange={addMessageFiles} />
                <textarea
                  rows={1}
                  value={messageInput}
                  onChange={(event) => setMessageInput(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendMessage(); } }}
                  placeholder={pendingInput ? "Type your answer…" : "Ask this workflow to do something…"}
                  aria-label="Message"
                />
                <button className="send-button" disabled={(!messageInput.trim() && !attachedFiles.length) || isRunning} onClick={sendMessage} aria-label="Send message">{isRunning ? <LoaderCircle size={18} className="spin" /> : <Send size={17} />}</button>
              </div>
              <p>Magic Conch can make mistakes. Review important results.</p>
            </div>
          </div>
          {debugOpen && <aside className="debug-panel">
            <div className="debug-panel-heading"><div><span className="eyebrow">Workflow debugger</span><strong>{activeWorkflow.name}</strong></div><button className="mini-icon" onClick={() => setDebugOpen(false)} aria-label="Close debugger"><PanelRightClose size={16} /></button></div>
            <div className="debug-summary"><span className={isRunning ? "live" : ""}><i /> {isRunning ? "Running" : "Idle"}</span><small>{debugEvents.length} step{debugEvents.length === 1 ? "" : "s"}</small><button onClick={() => setDebugEvents([])} disabled={isRunning}>Clear</button></div>
            <div className="debug-events">
              {debugEvents.length ? debugEvents.map((event, index) => <article className={`debug-event ${event.status}`} key={event.id}><span className="debug-rail">{index < debugEvents.length - 1 && <i />}</span><span className="debug-status-icon">{event.status === "running" ? <LoaderCircle size={14} className="spin" /> : event.status === "waiting" ? <MessageCircleQuestion size={14} /> : event.status === "routed" ? <Route size={14} /> : event.status === "error" ? <X size={14} /> : <Check size={14} />}</span><div><span><strong>{event.nodeName}</strong><small>{event.time}</small></span><b>{event.nodeType} · {event.status}</b><p>{event.detail}</p><DebugDataSection title="Inputs used" items={event.inputs} /><DebugDataSection title="Outputs produced" items={event.outputs} /></div></article>) : <div className="debug-empty"><Bug size={25} /><strong>No run recorded</strong><p>Send a message to see each workflow node execute here.</p></div>}
            </div>
            <button className="edit-flow-button" onClick={() => setTab("workflow")}><WorkflowIcon size={15} /> Open workflow editor</button>
          </aside>}
        </section>
      )}

      {settingsOpen && (
        <div
          className="modal-backdrop"
          role="button"
          tabIndex={-1}
          aria-label="Close settings"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSettingsOpen(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setSettingsOpen(false);
          }}
        >
          <section className="settings-modal" role="dialog" aria-modal="true" aria-label="Settings">
            <div className="modal-heading"><div><span className="eyebrow">Workspace</span><h2>Settings</h2></div><button className="icon-button" onClick={() => setSettingsOpen(false)} aria-label="Close"><X size={18} /></button></div>
            <nav className="settings-tabs" aria-label="Settings sections">
              <button className={settingsTab === "general" ? "active" : ""} onClick={() => setSettingsTab("general")}><Settings size={14} /> General</button>
              <button className={settingsTab === "api" ? "active" : ""} onClick={() => setSettingsTab("api")}><KeyRound size={14} /> API</button>
              <button className={settingsTab === "plugins" ? "active" : ""} onClick={() => setSettingsTab("plugins")}><Plug size={14} /> Plug-ins</button>
            </nav>
            <div className="settings-scroll">
              {settingsTab === "api" && (
                <div className="settings-section tab-section">
                  <div className="section-title"><KeyRound size={17} /><div><strong>AI provider connections</strong><small>Keys stay on this device and are sent only to the selected provider.</small></div></div>
                  <div className="settings-grid">
                    <label className="field-label">OpenAI API key<input type="password" placeholder="sk-…" value={providerSettings.openaiKey || ""} onChange={(event) => setProviderSettings((current) => ({ ...current, openaiKey: event.target.value }))} /></label>
                    <label className="field-label">OpenAI base URL<input placeholder="https://api.openai.com/v1" value={providerSettings.openaiUrl || ""} onChange={(event) => setProviderSettings((current) => ({ ...current, openaiUrl: event.target.value }))} /></label>
                    <label className="field-label">Google Gemini API key<input type="password" placeholder="AI…" value={providerSettings.geminiKey || ""} onChange={(event) => setProviderSettings((current) => ({ ...current, geminiKey: event.target.value }))} /></label>
                    <label className="field-label">Gemini base URL<input placeholder="https://generativelanguage.googleapis.com/v1beta" value={providerSettings.geminiUrl || ""} onChange={(event) => setProviderSettings((current) => ({ ...current, geminiUrl: event.target.value }))} /></label>
                    <label className="field-label">Anthropic API key<input type="password" placeholder="sk-ant-…" value={providerSettings.claudeKey || ""} onChange={(event) => setProviderSettings((current) => ({ ...current, claudeKey: event.target.value }))} /></label>
                    <label className="field-label">Claude base URL<input placeholder="https://api.anthropic.com/v1" value={providerSettings.claudeUrl || ""} onChange={(event) => setProviderSettings((current) => ({ ...current, claudeUrl: event.target.value }))} /></label>
                    <label className="field-label">Ollama URL<input value={providerSettings.ollamaUrl || ""} placeholder="http://localhost:11434" onChange={(event) => setProviderSettings((current) => ({ ...current, ollamaUrl: event.target.value }))} /></label>
                  </div>
                  <button className="secondary-button ollama-test" onClick={loadOllamaModels} disabled={ollamaLoading}><RefreshCw size={14} className={ollamaLoading ? "spin" : ""} /> Load installed Ollama models</button>
                  {!!ollamaModels.length && <div className="model-tags">{ollamaModels.map((model) => <span key={model}>{model}</span>)}</div>}
                </div>
              )}
              {settingsTab === "general" && (
                <>
                  <div className="settings-section tab-section">
                    <div className="section-title"><Undo2 size={17} /><div><strong>Workflow history</strong><small>Choose how many workflow changes are available to undo.</small></div></div>
                    <label className="field-label history-limit">Undo records<input type="number" min="1" max="500" value={undoLimit} onChange={(event) => setUndoLimit(Math.max(1, Math.min(500, Number(event.target.value) || 1)))} /><small className="field-help">Between 1 and 500 records per workflow.</small></label>
                  </div>
                  <div className="settings-section">
                    <div className="section-title"><FolderOpen size={17} /><div><strong>Default folders</strong><small>Each Load or Save node can override the database folder in its Inspector.</small></div></div>
                    <div className="folder-row"><span className="folder-icon"><FileJson size={18} /></span><div><strong>Workflow folder</strong><small>{workflowFolder ? workflowFolder.name : "Not connected — use Export to download files"}</small></div><button className="secondary-button" onClick={() => chooseFolder("workflow")}><FolderOpen size={14} /> Choose</button></div>
                    <div className="folder-row"><span className="folder-icon"><Database size={18} /></span><div><strong>Database folder</strong><small>{databaseFolder ? databaseFolder.name : "Not connected — using browser storage"}</small></div><button className="secondary-button" onClick={() => chooseFolder("database")}><FolderOpen size={14} /> Choose</button></div>
                  </div>
                  <div className="local-first-note"><HardDrive size={17} /><div><strong>Local-first by design</strong><span>Your workflows, keys, and saved records stay on this device unless you call an AI provider.</span></div></div>
                </>
              )}
              {settingsTab === "plugins" && (
                <div className="settings-section tab-section">
                  <div className="section-title"><Plug size={17} /><div><strong>Custom node plug-ins</strong><small>Install a JSON manifest to add nodes and custom JavaScript, template, or HTTP functions.</small></div></div>
                  <div className="plugin-warning"><Info size={16} /><span>Plug-ins can run code with access to this app. Install only files you trust.</span></div>
                  <button className="primary-button install-plugin" onClick={() => pluginInputRef.current?.click()}><Upload size={14} /> Install plug-in</button>
                  <input ref={pluginInputRef} type="file" accept="application/json,.json" hidden onChange={importPlugin} />
                  <div className="installed-plugins">
                    {plugins.length ? plugins.map((plugin) => <div key={plugin.id}><span className="folder-icon"><Plug size={16} /></span><span><strong>{plugin.name}</strong><small>v{plugin.version} · {plugin.nodes.length} node{plugin.nodes.length === 1 ? "" : "s"}</small></span><button className="mini-icon" aria-label={`Remove ${plugin.name}`} onClick={() => setPlugins((current) => current.filter((item) => item.id !== plugin.id))}><Trash2 size={14} /></button></div>) : <div className="no-plugins"><Plug size={22} /><span>No plug-ins installed yet</span><small>An example is included in examples/text-tools.plugin.json.</small></div>}
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer"><button className="primary-button" onClick={() => { setSettingsOpen(false); showToast("Settings saved"); }}><Check size={15} /> Done</button></div>
          </section>
        </div>
      )}
      {toast && <div className="toast"><Check size={15} /> {toast}</div>}
    </main>
  );
}
