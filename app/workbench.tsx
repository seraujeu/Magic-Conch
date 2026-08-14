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
  Search,
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
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AIProvider,
  ClaudeRequestSettings,
  GeminiRequestSettings,
  listAvailableModels,
  OllamaRequestSettings,
  OpenAIRequestSettings,
  ProviderSettings,
  requestAI,
} from "../lib/ai-providers";
import { collectFileAssets, fileAssetsPromptSections } from "../lib/file-content";
import { directorySubfolderSegments } from "../lib/directory-path";
import { chatSessionsFallbackJson, readStoredChatSessions, writeStoredChatSessions } from "../lib/chat-storage";
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
  aggregateJoinValues,
  createJoinInput,
  defaultJoinTemplate,
  growJoinInputs,
  JoinAggregation,
  JoinInputDefinition,
  joinInputVariable,
} from "../lib/join-aggregate";
import {
  expandWorkflowSyntax,
  expandWorkflowSyntaxInValue,
  WORKFLOW_SYNTAX,
  WorkflowSyntaxContext,
} from "../lib/workflow-syntax";
import { isWorkflowNodeActive } from "../lib/workflow-scheduler";
import { workflowExportFilename, workflowFileText } from "../lib/workflow-files";

type BuiltinNodeType = "start" | "input" | "request" | "workflow" | "string" | "integer" | "float" | "list-directory" | "save" | "load" | "set-state" | "transform" | "loop" | "retry" | "wait" | "code" | "parser" | "join" | "parallel" | "router-condition" | "router-ai" | "router-rule" | "end";
type NodeType = string;
type FileAsset = { name: string; type: string; data: string; size: number };
type PortDataType = "prompt" | "files" | "document" | "text" | "number" | "boolean" | "string" | "integer" | "float" | "image" | "video" | "audio" | "any";
type PortSpec = { id: string; label: string; type: PortDataType; multiple?: boolean };
type NodeSchema = { inputs: PortSpec[]; outputs: PortSpec[] };
type Point = { x: number; y: number };
type PortOffsets = Record<string, Point>;
type RouteOption = { id: string; label: string; value?: string };
type WorkflowContext = {
  userMessage: string;
  additionalInput?: string;
  loadedData?: string;
  lastOutput?: string;
  files: FileAsset[];
  values: Record<string, unknown>;
  syntax: WorkflowSyntaxContext;
  workflowStack?: string[];
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
    openaiReasoningEffort?: OpenAIRequestSettings["reasoningEffort"];
    openaiVerbosity?: OpenAIRequestSettings["verbosity"];
    openaiMaxCompletionTokens?: number;
    openaiTopP?: number;
    openaiFrequencyPenalty?: number;
    openaiPresencePenalty?: number;
    openaiSeed?: number;
    openaiStop?: string;
    geminiThinkingMode?: "minimal" | "low" | "medium" | "high" | "dynamic" | "off" | "budget";
    geminiThinkingBudget?: number;
    geminiMaxOutputTokens?: number;
    geminiTopP?: number;
    geminiTopK?: number;
    geminiSeed?: number;
    geminiStop?: string;
    claudeThinkingMode?: ClaudeRequestSettings["thinking"];
    claudeEffort?: ClaudeRequestSettings["effort"];
    claudeThinkingBudget?: number;
    claudeMaxTokens?: number;
    claudeTopP?: number;
    claudeTopK?: number;
    claudeStop?: string;
    ollamaThink?: "auto" | "on" | "off" | "low" | "medium" | "high";
    ollamaKeepAlive?: string;
    ollamaNumCtx?: number;
    ollamaNumPredict?: number;
    ollamaTopK?: number;
    ollamaTopP?: number;
    ollamaMinP?: number;
    ollamaSeed?: number;
    ollamaRepeatPenalty?: number;
    ollamaRepeatLastN?: number;
    ollamaStop?: string;
    key?: string;
    collision?: "overwrite" | "timestamp" | "increment";
    loadMode?: "latest" | "all" | "exact" | "folder";
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
    aggregateOperation?: JoinAggregation;
    aggregateTemplate?: string;
    joinInputs?: JoinInputDefinition[];
    conditionKind?: "truthy" | "equals" | "contains" | "input_type" | "file_extension";
    conditionValue?: string;
    stringValue?: string;
    integerValue?: number;
    floatValue?: number;
    includeSubfolders?: boolean;
    calledWorkflowId?: string;
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
  modelThinking?: string;
};

type LiveModelActivity = {
  nodeName: string;
  thinking: string;
  content: string;
};

type DirectoryHandle = {
  name: string;
  queryPermission?: (descriptor?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (descriptor?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
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
    values?: DirectoryHandle["values"];
  }>;
};

const DIRECTORY_HANDLE_DATABASE = "magic-conch-directory-handles";
const DIRECTORY_HANDLE_STORE = "node-directories";

function openDirectoryHandleDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DIRECTORY_HANDLE_DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DIRECTORY_HANDLE_STORE)) {
        request.result.createObjectStore(DIRECTORY_HANDLE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function rememberNodeDirectoryHandle(nodeId: string, handle: DirectoryHandle) {
  if (typeof indexedDB === "undefined") return;
  const database = await openDirectoryHandleDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(DIRECTORY_HANDLE_STORE, "readwrite");
    transaction.objectStore(DIRECTORY_HANDLE_STORE).put(handle, nodeId);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

async function restoreNodeDirectoryHandles() {
  if (typeof indexedDB === "undefined") return {} as Record<string, DirectoryHandle>;
  const database = await openDirectoryHandleDatabase();
  const handles = await new Promise<Record<string, DirectoryHandle>>((resolve, reject) => {
    const transaction = database.transaction(DIRECTORY_HANDLE_STORE, "readonly");
    const store = transaction.objectStore(DIRECTORY_HANDLE_STORE);
    const keysRequest = store.getAllKeys();
    const valuesRequest = store.getAll();
    transaction.oncomplete = () => resolve(Object.fromEntries(
      keysRequest.result.map((key, index) => [String(key), valuesRequest.result[index] as DirectoryHandle]),
    ));
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
  return handles;
}

async function ensureDirectoryPermission(handle: DirectoryHandle, mode: "read" | "readwrite") {
  let permission = await handle.queryPermission?.({ mode });
  if (permission === "granted" || permission === undefined) return;
  permission = await handle.requestPermission?.({ mode });
  if (permission !== "granted") {
    throw new Error(`Allow ${mode === "readwrite" ? "read and write" : "read"} access to “${handle.name}”, or choose the directory again.`);
  }
}

const NODE_META: Record<
  BuiltinNodeType,
  { label: string; subtitle: string; color: string; icon: typeof Play }
> = {
  start: { label: "Start", subtitle: "Entry point", color: "#27a36a", icon: Play },
  input: { label: "Message", subtitle: "Prompt and file output", color: "#7c63e8", icon: MessageCircleQuestion },
  request: { label: "Request", subtitle: "Call an AI model", color: "#e17444", icon: Cloud },
  workflow: { label: "Use Workflow", subtitle: "Run another workflow", color: "#6c68c9", icon: WorkflowIcon },
  string: { label: "String", subtitle: "Provide a string value", color: "#3689b5", icon: Variable },
  integer: { label: "Integer", subtitle: "Provide a whole number", color: "#b49332", icon: Variable },
  float: { label: "Float", subtitle: "Provide a decimal number", color: "#d09032", icon: Variable },
  "list-directory": { label: "Load Directory", subtitle: "Load the files in a directory", color: "#718e3c", icon: FolderOpen },
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

const BUILTIN_NODE_GROUPS: { id: string; label: string; types: BuiltinNodeType[] }[] = [
  { id: "essentials", label: "Essentials", types: ["start", "input", "end"] },
  { id: "ai", label: "AI", types: ["request"] },
  { id: "values", label: "Values", types: ["string", "integer", "float", "set-state"] },
  { id: "files", label: "Files", types: ["list-directory", "load", "save"] },
  { id: "processing", label: "Processing", types: ["transform", "code", "parser", "join"] },
  { id: "flow-control", label: "Flow control", types: ["workflow", "loop", "retry", "wait", "parallel"] },
  { id: "routing", label: "Routing", types: ["router-condition", "router-ai", "router-rule"] },
];

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
  if (["prompt", "files", "document", "text", "number", "boolean", "string", "integer", "float", "image", "video", "audio", "any"].includes(value)) {
    return value as PortDataType;
  }
  if (value === "multiline_string") return "string";
  if (["document", "pdf"].includes(value)) return "document";
  if (value === "file") return "files";
  return "any";
}

function getJoinInputs(node: FlowNode) {
  return node.config.joinInputs?.length ? node.config.joinInputs : [createJoinInput(1)];
}

function getNodeSchema(node: FlowNode, plugins: MagicConchPlugin[]): NodeSchema {
  const documentIn: PortSpec = { id: "document", label: "document", type: "document" };
  const documentOut: PortSpec = { id: "document", label: "document", type: "document" };
  const mediaInputs: PortSpec[] = [{ id: "image", label: "image", type: "image" }, { id: "video", label: "video", type: "video" }, { id: "audio", label: "audio", type: "audio" }];
  const mediaOutputs: PortSpec[] = [{ id: "image", label: "image", type: "image" }, { id: "video", label: "video", type: "video" }, { id: "audio", label: "audio", type: "audio" }];
  if (node.type === "start") return { inputs: [{ id: "agent_name", label: "agent name", type: "string" }, { id: "start_message", label: "start message", type: "string" }], outputs: [{ id: "prompt", label: "prompt", type: "prompt" }, { id: "files", label: "files", type: "files" }, ...mediaOutputs, documentOut] };
  if (node.type === "input") return { inputs: [{ id: "prompt", label: "prompt", type: "prompt" }, { id: "question", label: "question", type: "string" }, { id: "files", label: "files", type: "files" }, ...mediaInputs, documentIn], outputs: [{ id: "prompt", label: "prompt", type: "prompt" }, { id: "files", label: "files", type: "files" }, ...mediaOutputs, documentOut] };
  if (node.type === "request") return { inputs: [{ id: "prompt", label: "prompt", type: "prompt" }, { id: "system_prompt", label: "system prompt", type: "string" }, { id: "model", label: "model", type: "string" }, { id: "temperature", label: "temperature", type: "float" }, { id: "output_file_name", label: "output file", type: "string" }, { id: "files", label: "files", type: "files" }, ...mediaInputs, documentIn], outputs: [{ id: "prompt", label: "prompt", type: "prompt" }, { id: "files", label: "files", type: "files" }, ...mediaOutputs, documentOut] };
  if (node.type === "workflow") return { inputs: [{ id: "prompt", label: "prompt", type: "prompt" }, { id: "files", label: "files", type: "files" }, ...mediaInputs, documentIn], outputs: [{ id: "prompt", label: "prompt", type: "prompt" }, { id: "files", label: "files", type: "files" }, ...mediaOutputs, documentOut] };
  if (node.type === "string") return { inputs: [], outputs: [{ id: "value", label: "value", type: "string" }] };
  if (node.type === "integer") return { inputs: [], outputs: [{ id: "value", label: "value", type: "integer" }] };
  if (node.type === "float") return { inputs: [], outputs: [{ id: "value", label: "value", type: "float" }] };
  if (node.type === "list-directory") return { inputs: [{ id: "trigger", label: "trigger", type: "any" }, { id: "subfolder", label: "subfolder", type: "string" }, { id: "recursive", label: "recursive", type: "boolean" }], outputs: [{ id: "files", label: "files", type: "files" }, { id: "image", label: "images", type: "image" }, { id: "video", label: "videos", type: "video" }, { id: "audio", label: "audio", type: "audio" }, { id: "names", label: "names", type: "any" }, { id: "count", label: "count", type: "integer" }] };
  if (node.type === "save") return { inputs: [{ id: "prompt", label: "prompt", type: "prompt" }, { id: "key", label: "file key", type: "string" }, { id: "subfolder", label: "subfolder", type: "string" }, { id: "files", label: "files", type: "files" }, ...mediaInputs], outputs: [{ id: "prompt", label: "prompt", type: "prompt" }, { id: "files", label: "files", type: "files" }, ...mediaOutputs] };
  if (node.type === "load") return { inputs: [{ id: "trigger", label: "trigger", type: "any" }, { id: "key", label: "file key", type: "string" }, { id: "subfolder", label: "subfolder", type: "string" }, { id: "recursive", label: "recursive", type: "boolean" }], outputs: [{ id: "prompt", label: "prompt", type: "prompt" }, { id: "files", label: "files", type: "files" }, ...mediaOutputs, documentOut] };
  if (node.type === "set-state") return { inputs: [{ id: "value", label: "value", type: "any" }], outputs: [{ id: "value", label: node.config.variableName || "value", type: "any" }] };
  if (node.type === "transform") return { inputs: [{ id: "value", label: "value", type: "any" }], outputs: [{ id: "result", label: "result", type: "any" }] };
  if (node.type === "loop") return { inputs: [{ id: "items", label: "items", type: "any" }], outputs: [{ id: "item", label: "item", type: "any" }, { id: "index", label: "index", type: "number" }, { id: "has_more", label: "has more", type: "boolean" }, { id: "done", label: "done", type: "boolean" }] };
  if (node.type === "retry") return { inputs: [{ id: "success", label: "success", type: "boolean" }, { id: "error", label: "error", type: "any" }], outputs: [{ id: "next", label: "success", type: "boolean" }, { id: "retry", label: "retry", type: "boolean" }, { id: "failed", label: "failed", type: "boolean" }, { id: "attempt", label: "attempt", type: "number" }, { id: "parameters", label: "parameters", type: "any" }, { id: "error", label: "error", type: "any" }] };
  if (node.type === "wait") return { inputs: [{ id: "value", label: "value", type: "any" }], outputs: [{ id: "value", label: "value", type: "any" }] };
  if (node.type === "code") return { inputs: [{ id: "input", label: "input", type: "any" }], outputs: [{ id: "result", label: "result", type: "any" }] };
  if (node.type === "parser") return { inputs: [{ id: "source", label: "source", type: "any" }, { id: "document", label: "document", type: "document" }], outputs: [{ id: "data", label: "data", type: "any" }, { id: "text", label: "text", type: "text" }] };
  if (node.type === "join") return {
    inputs: getJoinInputs(node).map((input, index) => ({
      id: input.id,
      label: `{{${joinInputVariable(input, index)}}}`,
      type: "any",
    })),
    outputs: [{ id: "result", label: "result", type: "any" }],
  };
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
  if (node.type === "end") return { inputs: [{ id: "prompt", label: "prompt", type: "prompt" }, { id: "files", label: "files", type: "files" }, ...mediaInputs, documentIn], outputs: [] };

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
  if (output === input || output === "any" || input === "any") return true;
  const stringTypes: PortDataType[] = ["prompt", "text", "string"];
  const numberTypes: PortDataType[] = ["number", "integer", "float"];
  if (stringTypes.includes(output) && stringTypes.includes(input)) return true;
  if (numberTypes.includes(output) && numberTypes.includes(input)) return true;
  return input === "files" && ["image", "video", "audio"].includes(output);
}

function portElementKey(nodeId: string, portId: string, side: "input" | "output") {
  return `${nodeId}:${side}:${portId}`;
}

function portPoint(
  node: FlowNode,
  portId: string,
  side: "input" | "output",
  plugins: MagicConchPlugin[],
  portOffsets: PortOffsets,
) {
  const measuredOffset = portOffsets[portElementKey(node.id, portId, side)];
  if (measuredOffset) return { x: node.x + measuredOffset.x, y: node.y + measuredOffset.y };

  const ports = side === "input" ? getNodeSchema(node, plugins).inputs : getNodeSchema(node, plugins).outputs;
  const index = Math.max(0, ports.findIndex((port) => port.id === portId));
  return { x: node.x + (side === "output" ? 250 : 0), y: node.y + 75.5 + index * 25 };
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
  let migrated = [...dataEdges];
  const typePriority: PortDataType[] = ["prompt", "string", "any", "files", "image", "video", "audio", "document", "text", "integer", "float", "number", "boolean"];

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

  const nodes = workflow.nodes.map((node) => {
    if (node.type !== "join") return node;
    const inputs = node.config.joinInputs?.length ? [...node.config.joinInputs] : [];
    const incoming = migrated.filter((edge) => edge.to === node.id);
    const usedIds = new Set(incoming.filter((edge) => edge.toPort !== "values").map((edge) => edge.toPort));

    migrated = migrated.map((edge) => {
      if (edge.to !== node.id || edge.toPort !== "values") return edge;
      let target = inputs.find((input) => !usedIds.has(input.id));
      if (!target) {
        target = createJoinInput(inputs.length + 1);
        inputs.push(target);
      }
      usedIds.add(target.id);
      return { ...edge, toPort: target.id };
    });

    if (!inputs.length) {
      const existingPortIds = [...new Set(incoming.map((edge) => edge.toPort).filter((id): id is string => Boolean(id && id !== "values")))];
      existingPortIds.forEach((id, index) => inputs.push(createJoinInput(index + 1, id)));
    }
    if (!inputs.length) inputs.push(createJoinInput(1));

    const connectedIds = new Set(migrated.filter((edge) => edge.to === node.id).map((edge) => edge.toPort));
    if (connectedIds.has(inputs.at(-1)?.id)) inputs.push(createJoinInput(inputs.length + 1));
    return { ...node, config: { ...node.config, joinInputs: inputs } };
  });

  return { ...workflow, version: Math.max(3, workflow.version || 1), nodes, edges: migrated };
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
  version: 3,
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

function configuredScalarValue(node: FlowNode): string | number | undefined {
  if (node.type === "string") return node.config.stringValue || "";
  if (node.type === "integer") return Math.trunc(node.config.integerValue || 0);
  if (node.type === "float") return Number(node.config.floatValue || 0);
  return undefined;
}

function connectedConfiguredValue(workflow: Workflow, nodeId: string, portId: string) {
  const edge = workflow.edges.find((candidate) => candidate.to === nodeId && candidate.toPort === portId);
  const source = edge && workflow.nodes.find((node) => node.id === edge.from);
  return source ? configuredScalarValue(source) : undefined;
}

function getStartSettings(workflow: Workflow, syntax?: WorkflowSyntaxContext) {
  const start = workflow.nodes.find((node) => node.type === "start");
  const expand = (value: string) => syntax ? expandWorkflowSyntax(value, syntax) : value;
  const connectedAgentName = start ? connectedConfiguredValue(workflow, start.id, "agent_name") : undefined;
  const connectedStartMessage = start ? connectedConfiguredValue(workflow, start.id, "start_message") : undefined;
  return {
    agentName: expand(String(connectedAgentName ?? start?.config.agentName ?? "").trim() || workflow.name.trim() || DEFAULT_AGENT_NAME),
    startMessage: expand(String(connectedStartMessage ?? start?.config.startMessage ?? "").trim() || DEFAULT_START_MESSAGE),
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

function lines(value?: string) {
  return value?.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function openAIRequestSettings(node: FlowNode): OpenAIRequestSettings {
  return {
    reasoningEffort: node.config.openaiReasoningEffort,
    verbosity: node.config.openaiVerbosity,
    maxCompletionTokens: node.config.openaiMaxCompletionTokens,
    topP: node.config.openaiTopP,
    frequencyPenalty: node.config.openaiFrequencyPenalty,
    presencePenalty: node.config.openaiPresencePenalty,
    seed: node.config.openaiSeed,
    stop: lines(node.config.openaiStop),
  };
}

function geminiRequestSettings(node: FlowNode): GeminiRequestSettings {
  const mode = node.config.geminiThinkingMode;
  return {
    thinkingLevel: mode === "minimal" || mode === "low" || mode === "medium" || mode === "high" ? mode : undefined,
    thinkingBudget: mode === "dynamic" ? -1 : mode === "off" ? 0 : mode === "budget" ? node.config.geminiThinkingBudget : undefined,
    maxOutputTokens: node.config.geminiMaxOutputTokens,
    topP: node.config.geminiTopP,
    topK: node.config.geminiTopK,
    seed: node.config.geminiSeed,
    stopSequences: lines(node.config.geminiStop),
  };
}

function claudeRequestSettings(node: FlowNode): ClaudeRequestSettings {
  return {
    thinking: node.config.claudeThinkingMode,
    thinkingBudget: node.config.claudeThinkingBudget,
    effort: node.config.claudeEffort,
    maxTokens: node.config.claudeMaxTokens,
    topP: node.config.claudeTopP,
    topK: node.config.claudeTopK,
    stopSequences: lines(node.config.claudeStop),
  };
}

function ollamaRequestSettings(node: FlowNode): OllamaRequestSettings {
  const think = node.config.ollamaThink;
  return {
    think: think === "on" ? true : think === "off" ? false : think && think !== "auto" ? think : undefined,
    keepAlive: node.config.ollamaKeepAlive?.trim() || undefined,
    numCtx: node.config.ollamaNumCtx,
    numPredict: node.config.ollamaNumPredict,
    topK: node.config.ollamaTopK,
    topP: node.config.ollamaTopP,
    minP: node.config.ollamaMinP,
    seed: node.config.ollamaSeed,
    repeatPenalty: node.config.ollamaRepeatPenalty,
    repeatLastN: node.config.ollamaRepeatLastN,
    stop: lines(node.config.ollamaStop),
  };
}

function optionalNumber(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

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
        const isFileType = ["files", "image", "video", "audio"].includes(item.type);
        const files = isFileType && Array.isArray(item.value)
          ? item.value.filter((value): value is FileAsset => Boolean(value && typeof value === "object" && "name" in value))
          : [];
        return (
          <div className={`debug-datum datum-${item.type}`} key={`${title}-${item.port}`}>
            <div><strong>{item.label}</strong><small>{item.type}</small></div>
            {isFileType ? (
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
  const [liveModelActivities, setLiveModelActivities] = useState<Record<string, LiveModelActivity>>({});
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [isDraggingWorkflowFile, setIsDraggingWorkflowFile] = useState(false);
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
  const [availableModels, setAvailableModels] = useState<Partial<Record<AIProvider, string[]>>>({});
  const [modelsLoading, setModelsLoading] = useState<Partial<Record<AIProvider, boolean>>>({});
  const [plugins, setPlugins] = useState<MagicConchPlugin[]>([]);
  const [nodeSearch, setNodeSearch] = useState("");
  const [collapsedNodeGroups, setCollapsedNodeGroups] = useState<Record<string, boolean>>({});
  const [undoLimit, setUndoLimit] = useState(50);
  const [attachedFiles, setAttachedFiles] = useState<FileAsset[]>([]);
  const [workflowFolder, setWorkflowFolder] = useState<DirectoryHandle | null>(null);
  const [databaseFolder, setDatabaseFolder] = useState<DirectoryHandle | null>(null);
  const [pendingInput, setPendingInput] = useState<PendingWorkflowInput | null>(null);
  const [portOffsets, setPortOffsets] = useState<PortOffsets>({});

  const canvasRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
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
  const workflowDragDepthRef = useRef(0);
  const storageRestoredRef = useRef(false);
  const storageWarningShownRef = useRef(false);
  const [nodeFolderHandles, setNodeFolderHandles] = useState<Record<string, DirectoryHandle>>({});
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
  useEffect(() => {
    let active = true;
    restoreNodeDirectoryHandles()
      .then((handles) => { if (active) setNodeFolderHandles((current) => ({ ...handles, ...current })); })
      .catch(() => { /* Folder access can still be reconnected with Choose. */ });
    return () => { active = false; };
  }, []);
  const portLayoutKey = useMemo(
    () => activeWorkflow.nodes.map((node) => {
      const schema = getNodeSchema(node, plugins);
      return `${node.id}|${schema.inputs.map((port) => port.id).join(",")}|${schema.outputs.map((port) => port.id).join(",")}`;
    }).join(";"),
    [activeWorkflow.nodes, plugins],
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

  useLayoutEffect(() => {
    if (tab !== "workflow") return;

    const measurePorts = () => {
      const scene = sceneRef.current;
      if (!scene || !scene.offsetWidth || !scene.offsetHeight) return;
      const sceneRect = scene.getBoundingClientRect();
      const scaleX = sceneRect.width / scene.offsetWidth;
      const scaleY = sceneRect.height / scene.offsetHeight;
      if (!scaleX || !scaleY) return;

      const measured: PortOffsets = {};
      scene.querySelectorAll<HTMLElement>("[data-node-port-id]").forEach((port) => {
        const nodeId = port.dataset.nodeId;
        const portId = port.dataset.nodePortId;
        const side = port.dataset.portSide as "input" | "output" | undefined;
        const nodeElement = port.closest<HTMLElement>(".flow-node");
        if (!nodeId || !portId || !side || !nodeElement) return;
        const portRect = port.getBoundingClientRect();
        const nodeRect = nodeElement.getBoundingClientRect();
        measured[portElementKey(nodeId, portId, side)] = {
          x: (portRect.left + portRect.width / 2 - nodeRect.left) / scaleX,
          y: (portRect.top + portRect.height / 2 - nodeRect.top) / scaleY,
        };
      });

      setPortOffsets((current) => {
        const keys = Object.keys(measured);
        if (keys.length === Object.keys(current).length && keys.every((key) => (
          current[key]
          && Math.abs(current[key].x - measured[key].x) < 0.01
          && Math.abs(current[key].y - measured[key].y) < 0.01
        ))) return current;
        return measured;
      });
    };

    measurePorts();
    window.addEventListener("resize", measurePorts);
    return () => window.removeEventListener("resize", measurePorts);
  }, [portLayoutKey, tab, zoom]);

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
  const nodeLibraryGroups = useMemo(() => {
    const query = nodeSearch.trim().toLocaleLowerCase();
    const matchesSearch = (label: string) => !query || label.toLocaleLowerCase().includes(query);
    const builtinGroups = BUILTIN_NODE_GROUPS.map((group) => ({
      id: group.id,
      label: group.label,
      items: group.types
        .map((type) => ({ type, meta: NODE_META[type] }))
        .filter((item) => matchesSearch(item.meta.label)),
    }));
    const pluginGroups = plugins.map((plugin) => ({
      id: `plugin-${plugin.id}`,
      label: plugin.name,
      items: plugin.nodes
        .map((definition) => ({ type: definition.type, meta: getNodeMeta(definition.type, plugins) }))
        .filter((item) => matchesSearch(item.meta.label)),
    }));

    return [...builtinGroups, ...pluginGroups].filter((group) => group.items.length > 0);
  }, [nodeSearch, plugins]);
  const matchingNodeCount = nodeLibraryGroups.reduce((total, group) => total + group.items.length, 0);

  useEffect(() => {
    const restore = window.setTimeout(async () => {
      try {
        const savedFlows = localStorage.getItem("magic-conch-workflows");
        const savedSettings = localStorage.getItem("magic-conch-provider-settings");
        const savedPlugins = localStorage.getItem("magic-conch-plugins");
        const savedUndoLimit = localStorage.getItem("magic-conch-undo-limit");
        const savedSessionsJson = localStorage.getItem("magic-conch-chat-sessions");
        const indexedSessions = await readStoredChatSessions<Partial<ChatSession>[]>().catch(() => null);
        const savedSessions = indexedSessions ?? (savedSessionsJson ? JSON.parse(savedSessionsJson) as Partial<ChatSession>[] : null);
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
          const restored = savedSessions;
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
          if (!indexedSessions && savedSessionsJson) {
            await writeStoredChatSessions(sessions)
              .then(() => localStorage.removeItem("magic-conch-chat-sessions"))
              .catch(() => { /* The quota-safe fallback remains available. */ });
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
    writeStoredChatSessions(chatSessions)
      .then(() => localStorage.removeItem("magic-conch-chat-sessions"))
      .catch(() => {
        try {
          localStorage.setItem("magic-conch-chat-sessions", chatSessionsFallbackJson(chatSessions));
        } catch {
          if (!storageWarningShownRef.current) {
            storageWarningShownRef.current = true;
            showToast("Chat text is available now, but this browser could not save more history");
          }
        }
      });
    try {
      localStorage.setItem("magic-conch-active-session", activeSessionId);
    } catch {
      // A full localStorage must never interrupt the active chat.
    }
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
    data: { inputs?: DebugDatum[]; outputs?: DebugDatum[]; modelThinking?: string } = {},
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

  function handleWorkflowDragEnter(event: ReactDragEvent<HTMLElement>) {
    event.preventDefault();
    workflowDragDepthRef.current += 1;
    if (event.dataTransfer.types.includes("Files")) setIsDraggingWorkflowFile(true);
  }

  function handleWorkflowDragLeave(event: ReactDragEvent<HTMLElement>) {
    event.preventDefault();
    workflowDragDepthRef.current = Math.max(0, workflowDragDepthRef.current - 1);
    if (workflowDragDepthRef.current === 0) setIsDraggingWorkflowFile(false);
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
          : type === "workflow"
            ? { calledWorkflowId: workflows.find((workflow) => workflow.id !== activeWorkflow.id)?.id || "" }
          : type === "string"
            ? { stringValue: "" }
            : type === "integer"
              ? { integerValue: 0 }
              : type === "float"
                ? { floatValue: 0 }
                : type === "list-directory"
                  ? { subfolder: "", includeSubfolders: false }
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
                                  ? { aggregateOperation: "array", aggregateTemplate: "", joinInputs: [createJoinInput(1)] }
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
          if (node.id === targetId && node.type === "join") {
            const inputs = getJoinInputs(node);
            const joinInputs = growJoinInputs(inputs, targetPort, uid("join-input"));
            if (joinInputs !== inputs) return { ...node, config: { ...node.config, joinInputs } };
          }
          if (node.id === source.nodeId && ["router-ai", "router-rule"].includes(node.type)) {
            const options = node.config.routeOptions?.length ? node.config.routeOptions : [{ id: source.portId, label: "Option 1", value: node.config.routeValue || "" }];
            if (options.at(-1)?.id === source.portId) {
              return { ...node, config: { ...node.config, routeOptions: [...options, { id: uid("route"), label: `Option ${options.length + 1}`, value: "" }] } };
            }
          }
          return node;
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
      version: 3,
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
    await writable.write(new Blob([JSON.stringify(value, null, 2)], { type: "application/json;charset=utf-8" }));
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
        setNodeFolderHandles((current) => ({ ...current, [nodeId]: handle }));
        await rememberNodeDirectoryHandle(nodeId, handle).catch(() => { /* The handle remains usable for this session. */ });
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

  async function refreshAvailableModels(provider: AIProvider) {
    setModelsLoading((current) => ({ ...current, [provider]: true }));
    try {
      const models = await listAvailableModels(provider, providerSettings);
      setAvailableModels((current) => ({ ...current, [provider]: models }));
      const providerName = provider === "gemini" ? "Gemini" : provider === "claude" ? "Claude" : provider === "openai" ? "OpenAI" : "Ollama";
      showToast(`${models.length} ${providerName} model${models.length === 1 ? "" : "s"} loaded`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not load available models");
    } finally {
      setModelsLoading((current) => ({ ...current, [provider]: false }));
    }
  }

  async function saveWorkflow() {
    if (!activeWorkflow) return;
    if (workflowFolder) {
      const filename = workflowExportFilename(activeWorkflow.name);
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
    const json = JSON.stringify(activeWorkflow, null, 2);
    const blob = new Blob([new TextEncoder().encode(json)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = workflowExportFilename(activeWorkflow.name);
    link.click();
    URL.revokeObjectURL(url);
    showToast("Workflow exported");
  }

  async function importWorkflowFile(file: File): Promise<boolean> {
    try {
      const parsed = JSON.parse(workflowFileText(await file.text())) as Workflow;
      if (!parsed.nodes || !parsed.edges || !parsed.name) throw new Error();
      const imported = migrateWorkflow({ ...parsed, id: uid("workflow"), updatedAt: new Date().toISOString() }, plugins);
      setWorkflows((current) => [...current, imported]);
      setActiveWorkflowId(imported.id);
      setSelectedNodeId(null);
      setSelectedNodeIds([]);
      return true;
    } catch {
      return false;
    }
  }

  async function importWorkflow(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) showToast(await importWorkflowFile(file) ? "Workflow imported" : "That file is not a valid workflow");
    event.target.value = "";
  }

  async function handleWorkflowDrop(event: ReactDragEvent<HTMLElement>) {
    event.preventDefault();
    workflowDragDepthRef.current = 0;
    setIsDraggingWorkflowFile(false);
    const files = Array.from(event.dataTransfer.files);
    if (!files.length) return;

    let importedCount = 0;
    for (const file of files) {
      if (await importWorkflowFile(file)) importedCount += 1;
    }
    showToast(importedCount
      ? `${importedCount} workflow${importedCount === 1 ? "" : "s"} imported`
      : "No valid workflow files were dropped");
  }

  async function persistRecord(node: FlowNode, value: string, files: FileAsset[]) {
    const key = node.config.key || "workflow-result";
    const safeKey = (key || "workflow-result").replace(/[^a-zA-Z0-9-_]/g, "-");
    const rootFolder = nodeFolderHandles[node.id] || databaseFolder;
    if (rootFolder) await ensureDirectoryPermission(rootFolder, "readwrite");
    const segments = directorySubfolderSegments(node.config.subfolder, rootFolder?.name);
    const folder = rootFolder ? await resolveSubfolder(rootFolder, segments, true) : null;
    const savedFiles: string[] = [];
    if (folder && node.config.saveFiles !== "data") {
      for (const asset of files) {
        const filename = await collisionSafeName(folder, asset.name, node.config.collision);
        await writeAssetToFolder(folder, asset, filename);
        savedFiles.push(filename);
      }
    }
    const record = {
      key: safeKey,
      value,
      files: savedFiles,
      // Folder-backed records reference the written files. Browser-only records
      // retain the assets themselves so Load can restore media without a handle.
      assets: !folder && node.config.saveFiles !== "data" ? files : undefined,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(localRecordKey(safeKey, segments), JSON.stringify(record));
    if (folder && node.config.saveFiles !== "files") {
      const filename = await collisionSafeName(folder, `${safeKey}.json`, node.config.collision);
      await writeJsonToFolder(folder, filename, record);
    }
  }

  async function loadRecord(node: FlowNode) {
    const safeKey = (node.config.key || "workflow-result").replace(/[^a-zA-Z0-9-_]/g, "-");
    const rootFolder = nodeFolderHandles[node.id] || databaseFolder;
    if (rootFolder) await ensureDirectoryPermission(rootFolder, "read");
    const segments = directorySubfolderSegments(node.config.subfolder, rootFolder?.name);
    type StoredRecord = { value?: unknown; files?: string[]; assets?: FileAsset[] };
    const localRecord = () => {
      const raw = localStorage.getItem(localRecordKey(safeKey, segments));
      if (!raw) return null;
      try { return JSON.parse(raw) as StoredRecord; } catch { return null; }
    };
    const hydrateFiles = async (record: StoredRecord, folder?: DirectoryHandle) => {
      const assets = [...(record.assets || [])];
      if (!folder) return assets;
      for (const filename of record.files || []) {
        try {
          const handle = await folder.getFileHandle(filename);
          assets.push(await readFileAsset(await handle.getFile()));
        } catch {
          // Keep loading the remaining files when one referenced asset moved.
        }
      }
      return assets;
    };
    if (!rootFolder) {
      const record = localRecord();
      return record
        ? { value: String(record.value ?? ""), files: await hydrateFiles(record) }
        : { value: "No saved record was found.", files: [] };
    }
    let folder: DirectoryHandle;
    try {
      folder = await resolveSubfolder(rootFolder, segments, false);
    } catch {
      return { value: "The configured subfolder was not found.", files: [] };
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
    if (!matches.length) {
      const record = localRecord();
      return record
        ? { value: String(record.value ?? ""), files: await hydrateFiles(record, folder) }
        : { value: "No matching files were found.", files: [] };
    }
    matches.sort((a, b) => b.modified - a.modified);
    const selected = node.config.loadMode === "all" ? matches : [matches[0]];
    const values: string[] = [];
    const assets: FileAsset[] = [];
    for (const match of selected) {
      let record: StoredRecord;
      try { record = JSON.parse(match.text) as StoredRecord; }
      catch { record = { value: match.text }; }
      values.push(String(record.value ?? match.text));
      assets.push(...await hydrateFiles(record, folder));
    }
    const uniqueFiles = assets.filter((asset, index) => assets.findIndex((candidate) => candidate.name === asset.name && candidate.data === asset.data) === index);
    return { value: values.join("\n\n"), files: uniqueFiles };
  }

  async function loadDirectoryFiles(node: FlowNode, subfolder: string, recursive: boolean) {
    const rootFolder = nodeFolderHandles[node.id] || databaseFolder;
    if (!rootFolder) {
      throw new Error(node.config.directoryName
        ? `Reconnect the “${node.config.directoryName}” Node directory; its browser permission is no longer available.`
        : `Choose a directory for this ${node.type === "load" ? "Load" : "Load Directory"} node first.`);
    }
    await ensureDirectoryPermission(rootFolder, "read");
    const folder = await resolveSubfolder(rootFolder, directorySubfolderSegments(subfolder, rootFolder.name), false);
    const assets: FileAsset[] = [];
    const visit = async (current: DirectoryHandle, prefix = "") => {
      for await (const entry of current.values()) {
        const relativeName = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.kind === "directory") {
          if (recursive && entry.values) await visit(entry as DirectoryHandle, relativeName);
          continue;
        }
        if (!entry.getFile) continue;
        const file = await entry.getFile();
        const asset = await readFileAsset(file);
        assets.push({ ...asset, name: relativeName });
      }
    };
    await visit(folder);
    return assets;
  }

  function mediaAssets(files: FileAsset[], kind: "image" | "video" | "audio") {
    const extensions = {
      image: /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i,
      video: /\.(avi|m4v|mkv|mov|mp4|mpeg|webm)$/i,
      audio: /\.(aac|flac|m4a|mp3|ogg|wav|webm)$/i,
    };
    return files.filter((file) => file.type.startsWith(`${kind}/`) || extensions[kind].test(file.name));
  }

  async function executeCalledWorkflow(
    workflow: Workflow,
    prompt: string,
    incomingFiles: FileAsset[],
    parentContext: WorkflowContext,
    callerWorkflow: Workflow,
  ) {
    const workflowStack = parentContext.workflowStack?.length ? parentContext.workflowStack : [callerWorkflow.id];
    if (workflowStack.includes(workflow.id)) {
      const names = [...workflowStack, workflow.id].map((id) => workflows.find((item) => item.id === id)?.name || id);
      throw new Error(`Workflow recursion detected: ${names.join(" → ")}.`);
    }

    const start = workflow.nodes.find((node) => node.type === "start");
    if (!start) throw new Error(`Called workflow “${workflow.name}” needs a Start node.`);
    const files = [...(workflow.files || []), ...incomingFiles];
    const context: WorkflowContext = {
      userMessage: prompt,
      files,
      values: {},
      syntax: syntaxContextFor(workflow),
      workflowStack: [...workflowStack, workflow.id],
    };
    context.values[portValueKey(start.id, "prompt")] = prompt;
    context.values[portValueKey(start.id, "files")] = files;
    context.values[portValueKey(start.id, "image")] = mediaAssets(files, "image");
    context.values[portValueKey(start.id, "video")] = mediaAssets(files, "video");
    context.values[portValueKey(start.id, "audio")] = mediaAssets(files, "audio");
    context.values[portValueKey(start.id, "document")] = files.filter(isDocumentAsset);

    const reachable = new Set<string>([start.id]);
    const queue = [start.id];
    while (queue.length) {
      const sourceId = queue.shift()!;
      workflow.edges.filter((edge) => edge.from === sourceId).forEach((edge) => {
        if (!reachable.has(edge.to)) { reachable.add(edge.to); queue.push(edge.to); }
      });
    }
    let addedDependency = true;
    while (addedDependency) {
      addedDependency = false;
      workflow.edges.forEach((edge) => {
        if (reachable.has(edge.to) && !reachable.has(edge.from)) {
          reachable.add(edge.from);
          addedDependency = true;
        }
      });
    }

    const completed = new Set([start.id]);
    const skipped = new Set<string>();
    const emitted = new Set([
      portValueKey(start.id, "prompt"),
      portValueKey(start.id, "files"),
      portValueKey(start.id, "image"),
      portValueKey(start.id, "video"),
      portValueKey(start.id, "audio"),
      portValueKey(start.id, "document"),
    ]);
    const endResults: { text: string; files: FileAsset[] }[] = [];

    while (true) {
      const settled = new Set([...completed, ...skipped]);
      const pending = workflow.nodes.filter((node) => reachable.has(node.id) && !settled.has(node.id));
      if (!pending.length) break;
      const ready = pending.filter((node) => workflow.edges
        .filter((edge) => edge.to === node.id && reachable.has(edge.from))
        .every((edge) => settled.has(edge.from)));
      if (!ready.length) throw new Error(`Called workflow “${workflow.name}” contains a cycle.`);
      const activeReady = ready.filter((node) => isWorkflowNodeActive({
        nodeType: node.type,
        inputPorts: getNodeSchema(node, plugins).inputs,
        incoming: workflow.edges.filter((edge) => edge.to === node.id && reachable.has(edge.from)),
        emittedPortKeys: emitted,
      }));
      ready.filter((node) => !activeReady.includes(node)).forEach((node) => skipped.add(node.id));
      if (activeReady.some((node) => node.type === "input")) {
        throw new Error(`Called workflow “${workflow.name}” pauses at a Message node. Reusable workflows must run from Start to End without requesting another message.`);
      }
      const results = await Promise.all(activeReady.map(async (node) => ({
        node,
        result: await executeGraphNode(node, context, emitted, workflow),
      })));
      results.forEach(({ node, result }) => {
        completed.add(node.id);
        result.emittedPortKeys.forEach((key) => emitted.add(key));
        if (result.endResult) endResults.push(result.endResult);
      });
    }

    if (!endResults.length) throw new Error(`Called workflow “${workflow.name}” finished without reaching an End node.`);
    return {
      text: endResults.map((result) => result.text).filter(Boolean).join("\n\n"),
      files: collectFileAssets(endResults.map((result) => result.files)) as FileAsset[],
      endCount: endResults.length,
    };
  }

  async function executeGraphNode(
    sourceNode: FlowNode,
    context: WorkflowContext,
    availablePortKeys: Set<string>,
    workflow: Workflow = activeWorkflow,
  ): Promise<{ emittedPortKeys: string[]; endResult?: { text: string; files: FileAsset[] } }> {
      const node = expandWorkflowSyntaxInValue(sourceNode, context.syntax);
      const emittedPortKeys = new Set<string>();
      const inputFor = <T,>(portId: string, fallback: T): T => {
        const edges = workflow.edges.filter(
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
      const suppliedMedia = (["image", "video", "audio"] as const).map((portId) =>
        inputFor<unknown>(portId, undefined),
      );
      const documentInput = inputFor<FileAsset[] | FileAsset | undefined>("document", undefined);
      // Join/Aggregate deliberately preserves each input value. File-producing
      // nodes therefore yield nested arrays when combined; flatten them here so
      // Request, Save, and every other file-aware node receive all source files.
      const fileInput = collectFileAssets(suppliedFiles, suppliedMedia, documentInput) as FileAsset[];
      const nodeSchema = getNodeSchema(node, plugins);
      const debugInputs: DebugDatum[] = nodeSchema.inputs
        .map((port) => ({
          port: port.id,
          label: port.label,
          type: port.type,
          value: port.type === "prompt" ? promptInput : port.type === "files" ? fileInput : port.type === "document" ? inputFor(port.id, fileInput) : inputFor(port.id, undefined),
        }));
      if (node.type === "request" && (node.config.systemPrompt || inputFor("system_prompt", ""))) {
        debugInputs.push({ port: "system_prompt", label: "system prompt", type: "string", value: inputFor("system_prompt", node.config.systemPrompt || "") });
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

      if (node.type === "string") {
        const value = node.config.stringValue || "";
        output("value", value);
        context.lastOutput = value;
        debugDetail = `Provided a ${value.length}-character string.`;
      }

      if (node.type === "integer") {
        const value = Math.trunc(node.config.integerValue || 0);
        output("value", value);
        context.lastOutput = String(value);
        debugDetail = `Provided integer ${value}.`;
      }

      if (node.type === "float") {
        const value = Number(node.config.floatValue || 0);
        output("value", value);
        context.lastOutput = String(value);
        debugDetail = `Provided float ${value}.`;
      }

      if (node.type === "list-directory") {
        const subfolder = String(inputFor("subfolder", node.config.subfolder || ""));
        const recursive = Boolean(inputFor("recursive", node.config.includeSubfolders || false));
        const files = await loadDirectoryFiles(node, subfolder, recursive);
        output("files", files);
        output("image", mediaAssets(files, "image"));
        output("video", mediaAssets(files, "video"));
        output("audio", mediaAssets(files, "audio"));
        output("names", files.map((file) => file.name));
        output("count", files.length);
        debugDetail = `Loaded ${files.length} file${files.length === 1 ? "" : "s"} from ${node.config.directoryName || "the selected directory"}.`;
      }

      if (node.type === "request") {
        const fileSections = fileAssetsPromptSections(fileInput);
        const prompt = [
          String(promptInput),
          ...fileSections,
        ]
          .filter(Boolean)
          .join("\n\n");
        const provider = node.config.provider || "openai";
        if (provider === "ollama") {
          setLiveModelActivities((current) => ({ ...current, [node.id]: { nodeName: node.name, thinking: "", content: "" } }));
        }
        try {
          context.lastOutput = await requestAI(
            {
            provider,
            model: String(inputFor("model", node.config.model || modelDefaults[node.config.provider || "openai"])),
            systemPrompt: String(inputFor("system_prompt", node.config.systemPrompt || "")),
            temperature: Number(inputFor("temperature", node.config.temperature ?? 0.7)),
            prompt,
            files: fileInput,
            openai: provider === "openai" ? openAIRequestSettings(node) : undefined,
            gemini: provider === "gemini" ? geminiRequestSettings(node) : undefined,
            claude: provider === "claude" ? claudeRequestSettings(node) : undefined,
            ollama: provider === "ollama" ? ollamaRequestSettings(node) : undefined,
          },
          providerSettings,
          provider === "ollama" ? (progress) => {
            setLiveModelActivities((current) => ({
              ...current,
              [node.id]: { nodeName: node.name, thinking: progress.thinking, content: progress.content },
            }));
            updateDebugEvent(
              debugId,
              "running",
              progress.thinking && !progress.content
                ? `Model is thinking… ${progress.thinking.length} characters received.`
                : `Streaming response… ${progress.content.length} characters received.`,
              { modelThinking: progress.thinking },
            );
          } : undefined,
          );
        } finally {
          if (provider === "ollama") {
            setLiveModelActivities((current) => {
              const next = { ...current };
              delete next[node.id];
              return next;
            });
          }
        }
        const outputFileName = String(inputFor("output_file_name", node.config.outputFileName || ""));
        if (outputFileName) {
          const created = await readFileAsset(
            new File([context.lastOutput], outputFileName, { type: "text/plain" }),
          );
          fileInput.push(created);
        }
        output("prompt", context.lastOutput);
        output("files", fileInput);
        output("image", mediaAssets(fileInput, "image"));
        output("video", mediaAssets(fileInput, "video"));
        output("audio", mediaAssets(fileInput, "audio"));
        output("document", fileInput.filter(isDocumentAsset));
        debugDetail = `Generated ${context.lastOutput.length} prompt characters and passed ${fileInput.length} file${fileInput.length === 1 ? "" : "s"}.`;
      }

      if (node.type === "workflow") {
        const calledWorkflowId = node.config.calledWorkflowId;
        const calledWorkflow = workflows.find((item) => item.id === calledWorkflowId);
        if (!calledWorkflowId) throw new Error(`Choose a workflow for “${node.name}”.`);
        if (!calledWorkflow) throw new Error(`The workflow selected by “${node.name}” no longer exists.`);
        const result = await executeCalledWorkflow(calledWorkflow, String(promptInput), fileInput, context, workflow);
        context.lastOutput = result.text;
        output("prompt", result.text);
        output("files", result.files);
        output("image", mediaAssets(result.files, "image"));
        output("video", mediaAssets(result.files, "video"));
        output("audio", mediaAssets(result.files, "audio"));
        output("document", result.files.filter(isDocumentAsset));
        debugDetail = `Ran “${calledWorkflow.name}” and collected ${result.endCount} End result${result.endCount === 1 ? "" : "s"}.`;
      }

      if (node.type === "save") {
        const effectiveNode = { ...node, config: { ...node.config, key: String(inputFor("key", node.config.key || "workflow-result")), subfolder: String(inputFor("subfolder", node.config.subfolder || "")) } };
        await persistRecord(effectiveNode, String(promptInput), fileInput);
        output("prompt", promptInput);
        output("files", fileInput);
        output("image", mediaAssets(fileInput, "image"));
        output("video", mediaAssets(fileInput, "video"));
        output("audio", mediaAssets(fileInput, "audio"));
        debugDetail = `Saved prompt data and ${fileInput.length} file${fileInput.length === 1 ? "" : "s"}.`;
      }

      if (node.type === "load") {
        const effectiveNode = { ...node, config: { ...node.config, key: String(inputFor("key", node.config.key || "workflow-result")), subfolder: String(inputFor("subfolder", node.config.subfolder || "")) } };
        const loaded = node.config.loadMode === "folder"
          ? await (async () => {
              const files = await loadDirectoryFiles(
                effectiveNode,
                effectiveNode.config.subfolder || "",
                Boolean(inputFor("recursive", node.config.includeSubfolders || false)),
              );
              return { value: files.map((file) => file.name).join("\n"), files };
            })()
          : await loadRecord(effectiveNode);
        context.loadedData = loaded.value;
        context.lastOutput = loaded.value;
        output("prompt", loaded.value);
        output("files", loaded.files);
        output("image", mediaAssets(loaded.files, "image"));
        output("video", mediaAssets(loaded.files, "video"));
        output("audio", mediaAssets(loaded.files, "audio"));
        output("document", loaded.files.filter(isDocumentAsset));
        debugDetail = node.config.loadMode === "folder"
          ? `Loaded all ${loaded.files.length} file${loaded.files.length === 1 ? "" : "s"} from ${node.config.directoryName || "the selected folder"}.`
          : `Loaded ${loaded.value.length} prompt characters and ${loaded.files.length} file${loaded.files.length === 1 ? "" : "s"} from storage.`;
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
        const allJoinInputs = getJoinInputs(node)
          .map((input, index) => ({
            ...input,
            variable: joinInputVariable(input, index),
            value: inputFor<unknown>(input.id, undefined),
          }));
        const joinedInputs = allJoinInputs.filter((input) => input.value !== undefined);
        const aggregationInputs = node.config.aggregateOperation === "template" && node.config.aggregateTemplate
          ? allJoinInputs
          : joinedInputs;
        const result = aggregateJoinValues(
          node.config.aggregateOperation || "array",
          aggregationInputs,
          node.config.aggregateTemplate || "",
        );
        output("result", result);
        context.lastOutput = stringifyValue(result);
        debugDetail = `Aggregated ${joinedInputs.length} input${joinedInputs.length === 1 ? "" : "s"}.`;
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
        const provider = node.config.provider || "openai";
        const decision = await requestAI(
          {
            provider,
            model: node.config.model || modelDefaults[provider],
            temperature: 0,
            systemPrompt: `You are a routing classifier. Reply with only the option number from 1 to ${options.length}.`,
            prompt: `${node.config.routeCriteria || "Choose the best path."}\n\n${options.map((option, index) => `${index + 1}. ${option.label}`).join("\n")}\n\nInput:\n${String(promptInput)}`,
            openai: provider === "openai" ? openAIRequestSettings(node) : undefined,
            gemini: provider === "gemini" ? geminiRequestSettings(node) : undefined,
            claude: provider === "claude" ? claudeRequestSettings(node) : undefined,
            ollama: provider === "ollama" ? ollamaRequestSettings(node) : undefined,
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
    // Attribute/value nodes can feed a node that is already on the Start path.
    // Include those upstream dependencies, just as a data-flow editor does.
    let addedDependency = true;
    while (addedDependency) {
      addedDependency = false;
      activeWorkflow.edges.forEach((edge) => {
        if (reachable.has(edge.to) && !reachable.has(edge.from)) {
          reachable.add(edge.from);
          addedDependency = true;
        }
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
        return isWorkflowNodeActive({
          nodeType: node.type,
          inputPorts: getNodeSchema(node, plugins).inputs,
          incoming,
          emittedPortKeys: emitted,
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
        const questionEdge = activeWorkflow.edges.find((edge) => edge.to === waitingNode.id && edge.toPort === "question" && emitted.has(portValueKey(edge.from, edge.fromPort || "")));
        const question = String(questionEdge ? context.values[portValueKey(questionEdge.from, questionEdge.fromPort || "")] : resolvedWaitingNode.config.prompt || "What additional information should I know?");
        const debugInputs = getNodeSchema(resolvedWaitingNode, plugins).inputs.map((port) => ({
          port: port.id,
          label: port.label,
          type: port.type,
          value: undefined,
        }));
        addDebugEvent(resolvedWaitingNode, "waiting", question, { inputs: debugInputs });
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
          text: question,
          time: timeNow(),
          meta: getStartSettings(activeWorkflow, context.syntax).agentName,
        }]);
        setIsRunning(false);
        return;
      }
    }

    const hasReachableEnd = activeWorkflow.nodes.some((node) => node.type === "end" && reachable.has(node.id));
    setMessages((current) => [
      ...current,
      ...(endResults.length ? endResults.map((result) => ({
        id: uid("message"), role: "assistant" as const, text: result.text, time: timeNow(), meta: getStartSettings(activeWorkflow, context.syntax).agentName, files: result.files,
      })) : [{
        id: uid("message"), role: "assistant" as const,
        text: hasReachableEnd
          ? "Workflow stopped before reaching its End node. Check for an inactive route or upstream trigger."
          : "Workflow finished without a reachable End node.",
        time: timeNow(), meta: getStartSettings(activeWorkflow, context.syntax).agentName,
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
    const context: WorkflowContext = { userMessage: text, files, values: {}, syntax: syntaxContextFor(), workflowStack: [activeWorkflow.id] };
    context.values[portValueKey(start.id, "prompt")] = text;
    context.values[portValueKey(start.id, "files")] = files;
    context.values[portValueKey(start.id, "image")] = mediaAssets(files, "image");
    context.values[portValueKey(start.id, "video")] = mediaAssets(files, "video");
    context.values[portValueKey(start.id, "audio")] = mediaAssets(files, "audio");
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
      emittedPortKeys: [portValueKey(start.id, "prompt"), portValueKey(start.id, "files"), portValueKey(start.id, "image"), portValueKey(start.id, "video"), portValueKey(start.id, "audio"), portValueKey(start.id, "document")],
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
        context.values[portValueKey(pendingInput.nodeId, "image")] = mediaAssets(context.files, "image");
        context.values[portValueKey(pendingInput.nodeId, "video")] = mediaAssets(context.files, "video");
        context.values[portValueKey(pendingInput.nodeId, "audio")] = mediaAssets(context.files, "audio");
        context.values[portValueKey(pendingInput.nodeId, "document")] = context.files.filter(isDocumentAsset);
        setAttachedFiles([]);
        const runState: WorkflowRunState = {
          ...pendingInput.runState,
          completedNodeIds: [...pendingInput.runState.completedNodeIds, pendingInput.nodeId],
          emittedPortKeys: [
            ...pendingInput.runState.emittedPortKeys,
            portValueKey(pendingInput.nodeId, "prompt"),
            portValueKey(pendingInput.nodeId, "files"),
            portValueKey(pendingInput.nodeId, "image"),
            portValueKey(pendingInput.nodeId, "video"),
            portValueKey(pendingInput.nodeId, "audio"),
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
        <section
          className={`workflow-view ${isDraggingWorkflowFile ? "dragging-files" : ""}`}
          onDragEnter={handleWorkflowDragEnter}
          onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
          onDragLeave={handleWorkflowDragLeave}
          onDrop={handleWorkflowDrop}
        >
          {isDraggingWorkflowFile && <div className="file-drop-overlay"><span><FileJson size={24} /><strong>Drop workflow files to import</strong><small>Magic Conch workflow JSON files are supported.</small></span></div>}
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
            <label className="node-search">
              <Search size={14} />
              <input
                type="search"
                value={nodeSearch}
                onChange={(event) => setNodeSearch(event.target.value)}
                placeholder="Search nodes"
                aria-label="Search nodes by name"
              />
              {nodeSearch && <button type="button" onClick={() => setNodeSearch("")} aria-label="Clear node search"><X size={12} /></button>}
            </label>
            <div className="node-library">
              {nodeLibraryGroups.map((group) => {
                const isOpen = Boolean(nodeSearch.trim()) || !collapsedNodeGroups[group.id];
                return (
                  <section className="node-group" key={group.id}>
                    <button
                      type="button"
                      className={`node-group-toggle ${isOpen ? "" : "collapsed"}`}
                      onClick={() => setCollapsedNodeGroups((current) => ({ ...current, [group.id]: !current[group.id] }))}
                      aria-expanded={isOpen}
                    >
                      <span>{group.label}<small>{group.items.length}</small></span>
                      <ChevronDown size={13} />
                    </button>
                    {isOpen && <div className="node-group-items">{group.items.map(({ type, meta }) => {
                      const Icon = meta.icon;
                      return (
                        <button className="node-library-item" key={type} onClick={() => addNode(type)}>
                          <span className="library-icon" style={{ "--node-color": meta.color } as React.CSSProperties}><Icon size={15} /></span>
                          <span><strong>{meta.label}</strong><small>{meta.subtitle}</small></span>
                          <Plus size={14} className="add-icon" />
                        </button>
                      );
                    })}</div>}
                  </section>
                );
              })}
              {!matchingNodeCount && <div className="node-library-empty"><Search size={18} /><strong>No nodes found</strong><span>Try a different node name.</span></div>}
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
                ref={sceneRef}
                style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
              >
                <svg className="edges" width="1800" height="900" aria-label="Workflow connections">
                  {activeWorkflow.edges.map((edge) => {
                    const from = activeWorkflow.nodes.find((node) => node.id === edge.from);
                    const to = activeWorkflow.nodes.find((node) => node.id === edge.to);
                    if (!from || !to) return null;
                    const start = portPoint(from, edge.fromPort || "", "output", plugins, portOffsets);
                    const end = portPoint(to, edge.toPort || "", "input", plugins, portOffsets);
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
                    const start = portPoint(from, connectionSource.portId, "output", plugins, portOffsets);
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
                          <small>{node.type === "request" || node.type === "router-ai" ? `${node.config.provider || "openai"} · ${node.config.model || "model"}` : node.type === "workflow" ? workflows.find((workflow) => workflow.id === node.config.calledWorkflowId)?.name || "Select a workflow" : meta.subtitle}</small>
                        </span>
                      </div>
                      <div className="node-ports">
                        <div className="port-column input-column">
                          {schema.inputs.map((port) => {
                            const connected = activeWorkflow.edges.some((edge) => edge.to === node.id && edge.toPort === port.id);
                            return <div className="port-row" key={port.id}><button className={`typed-port input-port type-${port.type} ${connected ? "connected" : ""}`} data-node-id={node.id} data-node-port-id={port.id} data-port-side="input" data-input-node={node.id} data-input-port={port.id} data-input-type={port.type} aria-label={`${port.label} ${port.type} input`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); connectTo(node.id, port.id, port.type); }} /><span><b>{port.label}</b><small>{port.type}</small></span>{connected && <button className="disconnect-port" aria-label={`Disconnect ${port.label}`} title="Disconnect" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); disconnectInput(node.id, port.id); }}><X size={10} /></button>}</div>;
                          })}
                        </div>
                        <div className="port-column output-column">
                          {schema.outputs.map((port) => <div className="port-row" key={port.id}><span><b>{port.label}</b><small>{port.type}</small></span><button className={`typed-port output-port type-${port.type} ${connectionSource?.nodeId === node.id && connectionSource.portId === port.id ? "active" : ""}`} data-node-id={node.id} data-node-port-id={port.id} data-port-side="output" aria-label={`${port.label} ${port.type} output`} onPointerDown={(event) => beginConnection(event, node.id, port)} /></div>)}
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
                  {selectedNode.type === "string" && <label className="field-label">String value<textarea rows={4} value={selectedNode.config.stringValue || ""} placeholder="Enter text…" onChange={(event) => updateNode({ config: { stringValue: event.target.value } })} /><small className="field-help">Connect the string output to any compatible data or attribute input.</small></label>}
                  {selectedNode.type === "integer" && <label className="field-label">Integer value<input type="number" step="1" value={selectedNode.config.integerValue ?? 0} onChange={(event) => updateNode({ config: { integerValue: Math.trunc(Number(event.target.value) || 0) } })} /><small className="field-help">Decimals are truncated to a whole number.</small></label>}
                  {selectedNode.type === "float" && <label className="field-label">Float value<input type="number" step="any" value={selectedNode.config.floatValue ?? 0} onChange={(event) => updateNode({ config: { floatValue: Number(event.target.value) || 0 } })} /></label>}
                  {selectedNode.type === "start" && (
                    <>
                      <label className="field-label">Agent name<input value={selectedNode.config.agentName || ""} placeholder={DEFAULT_AGENT_NAME} onChange={(event) => updateNode({ config: { agentName: event.target.value } })} /><small className="field-help">Shown beside every message sent by this workflow.</small></label>
                      <label className="field-label">Start message<textarea rows={4} value={selectedNode.config.startMessage || ""} placeholder={DEFAULT_START_MESSAGE} onChange={(event) => updateNode({ config: { startMessage: event.target.value } })} /><small className="field-help">Shown when a new chat starts or this workflow is opened for testing.</small></label>
                    </>
                  )}
                  {selectedNode.type === "input" && (
                    <label className="field-label">Question<textarea rows={4} value={selectedNode.config.prompt || ""} onChange={(event) => updateNode({ config: { prompt: event.target.value } })} /></label>
                  )}
                  {selectedNode.type === "workflow" && (
                    <label className="field-label">Workflow
                      <div className="select-wrap"><select value={selectedNode.config.calledWorkflowId || ""} onChange={(event) => updateNode({ config: { calledWorkflowId: event.target.value } })}>
                        <option value="">Select a workflow…</option>
                        {workflows.filter((workflow) => workflow.id !== activeWorkflow.id).map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name}</option>)}
                      </select><ChevronDown size={14} /></div>
                      <small className="field-help">The selected workflow runs from Start to End using this node&apos;s prompt and files. Called workflows cannot pause at a Message node.</small>
                    </label>
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
                  {selectedNode.type === "join" && <>
                    <label className="field-label">Aggregation<div className="select-wrap"><select value={selectedNode.config.aggregateOperation || "array"} onChange={(event) => updateNode({ config: { aggregateOperation: event.target.value as FlowNode["config"]["aggregateOperation"] } })}><option value="array">Collect as array</option><option value="object">Collect as object</option><option value="concat">Concatenate text</option><option value="sum">Sum numbers</option><option value="template">Prompt template</option></select><ChevronDown size={14} /></div></label>
                    <div className="join-inputs-editor">
                      <span className="field-title-row"><b>Input variables</b><small>New inputs appear when the last port is linked.</small></span>
                      {getJoinInputs(selectedNode).map((input, index, inputs) => <label key={input.id}><span>{index + 1}</span><input aria-label={`Input ${index + 1} variable`} value={input.variable} placeholder={`input${index + 1}`} onChange={(event) => { const variable = event.target.value.replace(/[^a-z0-9_-]/gi, "").replace(/^[^a-z]+/i, ""); updateNode({ config: { joinInputs: inputs.map((item) => item.id === input.id ? { ...item, variable } : item) } }); }} /><code>{`{{${joinInputVariable(input, index)}}}`}</code></label>)}
                    </div>
                    {selectedNode.config.aggregateOperation === "template" && <label className="field-label">Prompt template<textarea rows={6} value={selectedNode.config.aggregateTemplate || ""} placeholder={defaultJoinTemplate(getJoinInputs(selectedNode))} onChange={(event) => updateNode({ config: { aggregateTemplate: event.target.value } })} /><small className="field-help">Place the variables above anywhere in the prompt. Dot paths such as {`{{input2.name}}`} select nested values.</small></label>}
                  </>}
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
                        <span className="field-title-row">Model <button type="button" onClick={() => refreshAvailableModels(selectedNode.config.provider || "openai")} disabled={modelsLoading[selectedNode.config.provider || "openai"]}><RefreshCw size={12} className={modelsLoading[selectedNode.config.provider || "openai"] ? "spin" : ""} /> Refresh available</button></span>
                        <input list="available-ai-models" value={selectedNode.config.model || ""} onChange={(event) => updateNode({ config: { model: event.target.value } })} />
                        <datalist id="available-ai-models">{(availableModels[selectedNode.config.provider || "openai"] || []).map((model) => <option key={model} value={model} />)}</datalist>
                      </label>
                      {selectedNode.type === "request" ? <>
                        <label className="field-label">System prompt<textarea rows={5} value={selectedNode.config.systemPrompt || ""} placeholder="Describe how the model should behave…" onChange={(event) => updateNode({ config: { systemPrompt: event.target.value } })} /></label>
                        <label className="field-label">Create file from response<input value={selectedNode.config.outputFileName || ""} placeholder="Optional, e.g. report.md" onChange={(event) => updateNode({ config: { outputFileName: event.target.value } })} /><small className="field-help">When set, the response becomes a workflow file that Save nodes can write.</small></label>
                      </> : <>
                        <label className="field-label">Routing criteria<textarea rows={4} value={selectedNode.config.routeCriteria || ""} placeholder="Describe when to choose path A or B…" onChange={(event) => updateNode({ config: { routeCriteria: event.target.value } })} /></label>
                      </>}
                      <label className="field-label range-label"><span>Temperature <b>{selectedNode.config.temperature ?? 0.7}</b></span><input type="range" min="0" max="2" step="0.1" value={selectedNode.config.temperature ?? 0.7} onChange={(event) => updateNode({ config: { temperature: Number(event.target.value) } })} /></label>
                      {(selectedNode.config.provider || "openai") === "openai" && (
                        <details className="provider-advanced" open>
                          <summary><BrainCircuit size={14} /><span><b>OpenAI generation settings</b><small>Reasoning effort, response length, sampling, and limits</small></span><ChevronDown size={14} /></summary>
                          <div className="provider-fields">
                            <label className="field-label">Reasoning effort<div className="select-wrap"><select value={selectedNode.config.openaiReasoningEffort || "default"} onChange={(event) => updateNode({ config: { openaiReasoningEffort: event.target.value === "default" ? undefined : event.target.value as OpenAIRequestSettings["reasoningEffort"] } })}><option value="default">Model default</option><option value="none">None</option><option value="minimal">Minimal</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="xhigh">Extra high</option><option value="max">Maximum</option></select><ChevronDown size={14} /></div><small className="field-help">Available levels depend on the model. Temperature is omitted above none.</small></label>
                            <label className="field-label">Verbosity<div className="select-wrap"><select value={selectedNode.config.openaiVerbosity || "default"} onChange={(event) => updateNode({ config: { openaiVerbosity: event.target.value === "default" ? undefined : event.target.value as OpenAIRequestSettings["verbosity"] } })}><option value="default">Model default</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select><ChevronDown size={14} /></div></label>
                            <div className="provider-number-grid">
                              <label className="field-label">Max output tokens<input type="number" min="1" step="1" placeholder="Model default" value={selectedNode.config.openaiMaxCompletionTokens ?? ""} onChange={(event) => updateNode({ config: { openaiMaxCompletionTokens: optionalNumber(event.target.value) } })} /></label>
                              <label className="field-label">Top P<input type="number" min="0" max="1" step="0.01" placeholder="Model default" value={selectedNode.config.openaiTopP ?? ""} onChange={(event) => updateNode({ config: { openaiTopP: optionalNumber(event.target.value) } })} /></label>
                              <label className="field-label">Frequency penalty<input type="number" min="-2" max="2" step="0.1" placeholder="Model default" value={selectedNode.config.openaiFrequencyPenalty ?? ""} onChange={(event) => updateNode({ config: { openaiFrequencyPenalty: optionalNumber(event.target.value) } })} /></label>
                              <label className="field-label">Presence penalty<input type="number" min="-2" max="2" step="0.1" placeholder="Model default" value={selectedNode.config.openaiPresencePenalty ?? ""} onChange={(event) => updateNode({ config: { openaiPresencePenalty: optionalNumber(event.target.value) } })} /></label>
                              <label className="field-label">Seed<input type="number" step="1" placeholder="Random" value={selectedNode.config.openaiSeed ?? ""} onChange={(event) => updateNode({ config: { openaiSeed: optionalNumber(event.target.value) } })} /></label>
                            </div>
                            <label className="field-label">Stop sequences<textarea rows={3} value={selectedNode.config.openaiStop || ""} placeholder="One sequence per line" onChange={(event) => updateNode({ config: { openaiStop: event.target.value } })} /></label>
                          </div>
                        </details>
                      )}
                      {selectedNode.config.provider === "gemini" && (
                        <details className="provider-advanced" open>
                          <summary><BrainCircuit size={14} /><span><b>Gemini generation settings</b><small>Thinking level or budget, sampling, and limits</small></span><ChevronDown size={14} /></summary>
                          <div className="provider-fields">
                            <label className="field-label">Thinking<div className="select-wrap"><select value={selectedNode.config.geminiThinkingMode || "default"} onChange={(event) => updateNode({ config: { geminiThinkingMode: event.target.value === "default" ? undefined : event.target.value as FlowNode["config"]["geminiThinkingMode"] } })}><option value="default">Model default</option><optgroup label="Gemini 3"><option value="minimal">Minimal</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></optgroup><optgroup label="Gemini 2.5"><option value="dynamic">Dynamic budget</option><option value="off">Off (supported Flash models)</option><option value="budget">Custom token budget</option></optgroup></select><ChevronDown size={14} /></div><small className="field-help">Gemini 3 uses levels; Gemini 2.5 uses a token budget. Support varies by model.</small></label>
                            {selectedNode.config.geminiThinkingMode === "budget" && <label className="field-label">Thinking token budget<input type="number" min="0" step="1" placeholder="1024" value={selectedNode.config.geminiThinkingBudget ?? ""} onChange={(event) => updateNode({ config: { geminiThinkingBudget: optionalNumber(event.target.value) } })} /></label>}
                            <div className="provider-number-grid">
                              <label className="field-label">Max output tokens<input type="number" min="1" step="1" placeholder="Model default" value={selectedNode.config.geminiMaxOutputTokens ?? ""} onChange={(event) => updateNode({ config: { geminiMaxOutputTokens: optionalNumber(event.target.value) } })} /></label>
                              <label className="field-label">Top P<input type="number" min="0" max="1" step="0.01" placeholder="Model default" value={selectedNode.config.geminiTopP ?? ""} onChange={(event) => updateNode({ config: { geminiTopP: optionalNumber(event.target.value) } })} /></label>
                              <label className="field-label">Top K<input type="number" min="1" step="1" placeholder="Model default" value={selectedNode.config.geminiTopK ?? ""} onChange={(event) => updateNode({ config: { geminiTopK: optionalNumber(event.target.value) } })} /></label>
                              <label className="field-label">Seed<input type="number" step="1" placeholder="Random" value={selectedNode.config.geminiSeed ?? ""} onChange={(event) => updateNode({ config: { geminiSeed: optionalNumber(event.target.value) } })} /></label>
                            </div>
                            <label className="field-label">Stop sequences<textarea rows={3} value={selectedNode.config.geminiStop || ""} placeholder="One sequence per line" onChange={(event) => updateNode({ config: { geminiStop: event.target.value } })} /></label>
                          </div>
                        </details>
                      )}
                      {selectedNode.config.provider === "claude" && (
                        <details className="provider-advanced" open>
                          <summary><BrainCircuit size={14} /><span><b>Anthropic generation settings</b><small>Adaptive thinking, effort, sampling, and limits</small></span><ChevronDown size={14} /></summary>
                          <div className="provider-fields">
                            <label className="field-label">Thinking mode<div className="select-wrap"><select value={selectedNode.config.claudeThinkingMode || "default"} onChange={(event) => updateNode({ config: { claudeThinkingMode: event.target.value === "default" ? undefined : event.target.value as ClaudeRequestSettings["thinking"] } })}><option value="default">Model default</option><option value="adaptive">Adaptive</option><option value="disabled">Disabled</option><option value="enabled">Manual budget (legacy models)</option></select><ChevronDown size={14} /></div><small className="field-help">Current Claude models use adaptive thinking; older supported models use a manual budget.</small></label>
                            <label className="field-label">Effort<div className="select-wrap"><select value={selectedNode.config.claudeEffort || "default"} onChange={(event) => updateNode({ config: { claudeEffort: event.target.value === "default" ? undefined : event.target.value as ClaudeRequestSettings["effort"] } })}><option value="default">Model default</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="xhigh">Extra high</option><option value="max">Maximum</option></select><ChevronDown size={14} /></div><small className="field-help">Effort controls total response work and, in adaptive mode, thinking depth. Temperature is omitted when set.</small></label>
                            {selectedNode.config.claudeThinkingMode === "enabled" && <label className="field-label">Thinking token budget<input type="number" min="1024" step="1" placeholder="1024" value={selectedNode.config.claudeThinkingBudget ?? ""} onChange={(event) => updateNode({ config: { claudeThinkingBudget: optionalNumber(event.target.value) } })} /><small className="field-help">Must be lower than max output tokens.</small></label>}
                            <div className="provider-number-grid">
                              <label className="field-label">Max output tokens<input type="number" min="1" step="1" placeholder="2048" value={selectedNode.config.claudeMaxTokens ?? ""} onChange={(event) => updateNode({ config: { claudeMaxTokens: optionalNumber(event.target.value) } })} /></label>
                              <label className="field-label">Top P<input type="number" min="0" max="1" step="0.01" placeholder="Model default" value={selectedNode.config.claudeTopP ?? ""} onChange={(event) => updateNode({ config: { claudeTopP: optionalNumber(event.target.value) } })} /></label>
                              <label className="field-label">Top K<input type="number" min="0" step="1" placeholder="Model default" value={selectedNode.config.claudeTopK ?? ""} onChange={(event) => updateNode({ config: { claudeTopK: optionalNumber(event.target.value) } })} /></label>
                            </div>
                            <label className="field-label">Stop sequences<textarea rows={3} value={selectedNode.config.claudeStop || ""} placeholder="One sequence per line" onChange={(event) => updateNode({ config: { claudeStop: event.target.value } })} /></label>
                          </div>
                        </details>
                      )}
                      {selectedNode.config.provider === "ollama" && (
                        <details className="ollama-advanced" open>
                          <summary><BrainCircuit size={14} /><span><b>Ollama generation settings</b><small>Thinking, context, sampling, and model lifetime</small></span><ChevronDown size={14} /></summary>
                          <div className="ollama-fields">
                            <label className="field-label">Thinking<div className="select-wrap"><select value={selectedNode.config.ollamaThink || "auto"} onChange={(event) => updateNode({ config: { ollamaThink: event.target.value as FlowNode["config"]["ollamaThink"] } })}><option value="auto">Model default</option><option value="on">On</option><option value="off">Off</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select><ChevronDown size={14} /></div><small className="field-help">Supported models stream thinking separately from the answer. GPT-OSS uses a level.</small></label>
                            <div className="ollama-number-grid">
                              <label className="field-label">Context window<input type="number" min="1" placeholder="Model default" value={selectedNode.config.ollamaNumCtx ?? ""} onChange={(event) => updateNode({ config: { ollamaNumCtx: optionalNumber(event.target.value) } })} /></label>
                              <label className="field-label">Max output tokens<input type="number" min="-1" placeholder="Model default" value={selectedNode.config.ollamaNumPredict ?? ""} onChange={(event) => updateNode({ config: { ollamaNumPredict: optionalNumber(event.target.value) } })} /></label>
                              <label className="field-label">Top K<input type="number" min="0" placeholder="Model default" value={selectedNode.config.ollamaTopK ?? ""} onChange={(event) => updateNode({ config: { ollamaTopK: optionalNumber(event.target.value) } })} /></label>
                              <label className="field-label">Top P<input type="number" min="0" max="1" step="0.01" placeholder="Model default" value={selectedNode.config.ollamaTopP ?? ""} onChange={(event) => updateNode({ config: { ollamaTopP: optionalNumber(event.target.value) } })} /></label>
                              <label className="field-label">Min P<input type="number" min="0" max="1" step="0.01" placeholder="Model default" value={selectedNode.config.ollamaMinP ?? ""} onChange={(event) => updateNode({ config: { ollamaMinP: optionalNumber(event.target.value) } })} /></label>
                              <label className="field-label">Seed<input type="number" step="1" placeholder="Random" value={selectedNode.config.ollamaSeed ?? ""} onChange={(event) => updateNode({ config: { ollamaSeed: optionalNumber(event.target.value) } })} /></label>
                              <label className="field-label">Repeat penalty<input type="number" min="0" step="0.05" placeholder="Model default" value={selectedNode.config.ollamaRepeatPenalty ?? ""} onChange={(event) => updateNode({ config: { ollamaRepeatPenalty: optionalNumber(event.target.value) } })} /></label>
                              <label className="field-label">Repeat window<input type="number" step="1" placeholder="Model default" value={selectedNode.config.ollamaRepeatLastN ?? ""} onChange={(event) => updateNode({ config: { ollamaRepeatLastN: optionalNumber(event.target.value) } })} /></label>
                            </div>
                            <label className="field-label">Keep alive<input value={selectedNode.config.ollamaKeepAlive || ""} placeholder="Server default, e.g. 5m or 0" onChange={(event) => updateNode({ config: { ollamaKeepAlive: event.target.value } })} /></label>
                            <label className="field-label">Stop sequences<textarea rows={3} value={selectedNode.config.ollamaStop || ""} placeholder={"One sequence per line"} onChange={(event) => updateNode({ config: { ollamaStop: event.target.value } })} /></label>
                          </div>
                        </details>
                      )}
                    </>
                  )}
                  {selectedNode.type === "router-rule" && (
                    <>
                      <label className="field-label">Rule method<div className="select-wrap"><select value={selectedNode.config.routeMethod || "contains"} onChange={(event) => updateNode({ config: { routeMethod: event.target.value as FlowNode["config"]["routeMethod"] } })}><option value="contains">Contains text</option><option value="not_contains">Does not contain text</option><option value="equals">Equals text</option><option value="starts_with">Starts with</option><option value="ends_with">Ends with</option><option value="regex">Regular expression</option><option value="length_gt">Text length greater than</option><option value="length_lt">Text length less than</option><option value="is_empty">Is empty</option><option value="file_type">Has file type</option><option value="file_count_gt">File count greater than</option><option value="number_gt">Number greater than</option><option value="number_lt">Number less than</option></select><ChevronDown size={14} /></div></label>
                      <label className="check-field"><input type="checkbox" checked={selectedNode.config.caseSensitive || false} onChange={(event) => updateNode({ config: { caseSensitive: event.target.checked } })} /><span>Case-sensitive text matching</span></label>
                    </>
                  )}
                  {(selectedNode.type === "router-ai" || selectedNode.type === "router-rule") && <div className="route-options-editor"><span className="field-title-row"><b>Route outputs</b><button type="button" onClick={() => addRouteOption(selectedNode.id)}><Plus size={12} /> Add option</button></span>{(selectedNode.config.routeOptions || [{ id: "route-1", label: "Option 1", value: selectedNode.config.routeValue || "" }]).map((option, index, options) => <div className="route-option-row" key={option.id}><span>{index + 1}</span><div><input aria-label={`Option ${index + 1} label`} value={option.label} onChange={(event) => updateNode({ config: { routeOptions: options.map((item) => item.id === option.id ? { ...item, label: event.target.value } : item) } })} />{selectedNode.type === "router-rule" && selectedNode.config.routeMethod !== "is_empty" && <input aria-label={`${option.label} match value`} className="route-value-input" value={option.value || ""} placeholder="Match value" onChange={(event) => updateNode({ config: { routeOptions: options.map((item) => item.id === option.id ? { ...item, value: event.target.value } : item) } })} />}</div><button className="mini-icon route-option-delete" disabled={options.length <= 1} aria-label={options.length <= 1 ? "At least one route option is required" : `Remove ${option.label}`} title={options.length <= 1 ? "At least one output is required" : "Delete output"} onClick={() => removeRouteOption(selectedNode.id, option.id)}><Trash2 size={13} /></button></div>)}<small>Connecting the last output automatically creates the next one.</small></div>}
                  {selectedNode.type === "list-directory" && (
                    <>
                      <label className="field-label">Subfolder path<input value={selectedNode.config.subfolder || ""} placeholder="Optional relative subfolder" onChange={(event) => updateNode({ config: { subfolder: event.target.value } })} /><small className="field-help">May also be supplied through the string attribute port.</small></label>
                      <label className="check-field"><input type="checkbox" checked={selectedNode.config.includeSubfolders || false} onChange={(event) => updateNode({ config: { includeSubfolders: event.target.checked } })} /><span>Include files in subfolders</span></label>
                      <div className="node-folder-picker"><span><FolderOpen size={15} /><span><strong>Directory to load</strong><small>{nodeFolderHandles[selectedNode.id]?.name || databaseFolder?.name || (selectedNode.config.directoryName ? `Reconnect “${selectedNode.config.directoryName}”` : "No directory selected")}</small></span></span><button className="secondary-button" onClick={() => chooseFolder("node", selectedNode.id)}>{nodeFolderHandles[selectedNode.id] ? "Change" : "Choose"}</button></div>
                    </>
                  )}
                  {(selectedNode.type === "save" || selectedNode.type === "load") && (
                    <>
                      {(selectedNode.type === "save" || selectedNode.config.loadMode !== "folder") && <label className="field-label">File key<input value={selectedNode.config.key || ""} placeholder="record-name" onChange={(event) => updateNode({ config: { key: event.target.value } })} /><small className="field-help">Versioned files with the same key can coexist.</small></label>}
                      <label className="field-label">Subfolder path<input value={selectedNode.config.subfolder || ""} placeholder="Optional, relative to the directory below" onChange={(event) => updateNode({ config: { subfolder: event.target.value } })} /><small className="field-help">Leave blank to use the selected directory itself. Absolute paths work only when they contain the selected directory.</small></label>
                      <div className="node-folder-picker"><span><FolderOpen size={15} /><span><strong>Node directory</strong><small>{nodeFolderHandles[selectedNode.id]?.name || databaseFolder?.name || (selectedNode.config.directoryName ? `Reconnect “${selectedNode.config.directoryName}”` : "No directory selected")}</small></span></span><button className="secondary-button" onClick={() => chooseFolder("node", selectedNode.id)}>{nodeFolderHandles[selectedNode.id] ? "Change" : "Choose"}</button></div>
                      {selectedNode.type === "save" ? (
                        <>
                          <label className="field-label">When a name already exists<div className="select-wrap"><select value={selectedNode.config.collision || "increment"} onChange={(event) => updateNode({ config: { collision: event.target.value as FlowNode["config"]["collision"] } })}><option value="increment">Add number (file-2)</option><option value="timestamp">Add timestamp</option><option value="overwrite">Overwrite</option></select><ChevronDown size={14} /></div></label>
                          <label className="field-label">Save<div className="select-wrap"><select value={selectedNode.config.saveFiles || "both"} onChange={(event) => updateNode({ config: { saveFiles: event.target.value as FlowNode["config"]["saveFiles"] } })}><option value="both">Data and files</option><option value="data">Data only</option><option value="files">Files only</option></select><ChevronDown size={14} /></div></label>
                        </>
                      ) : (
                        <>
                          <label className="field-label">Load mode<div className="select-wrap"><select value={selectedNode.config.loadMode || "latest"} onChange={(event) => updateNode({ config: { loadMode: event.target.value as FlowNode["config"]["loadMode"] } })}><option value="latest">Newest saved record</option><option value="all">All matching saved records</option><option value="exact">Exact saved record name</option><option value="folder">All files in folder</option></select><ChevronDown size={14} /></div></label>
                          {selectedNode.config.loadMode === "folder" && <label className="check-field"><input type="checkbox" checked={selectedNode.config.includeSubfolders || false} onChange={(event) => updateNode({ config: { includeSubfolders: event.target.checked } })} /><span>Include files in subfolders</span></label>}
                        </>
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
                  <div className="message-block"><div className="message-meta"><strong>{getStartSettings(activeWorkflow, syntaxContextFor()).agentName}</strong><span>{Object.keys(liveModelActivities).length ? "Model responding live" : "Running workflow"}</span></div>{Object.values(liveModelActivities).length ? <div className="message-bubble live-model-stream">{Object.entries(liveModelActivities).map(([nodeId, activity]) => <div className="live-model-activity" key={nodeId}><strong><BrainCircuit size={13} /> {activity.nodeName}</strong><div className="live-thinking"><span>Thinking live</span><pre>{activity.thinking || (activity.content ? "This model did not expose separate thinking output." : "Waiting for thinking output…")}</pre></div>{activity.content && <div className="live-answer"><span>Answer</span><div className="message-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{activity.content}</ReactMarkdown></div></div>}</div>)}</div> : <div className="message-bubble typing"><i /><i /><i /></div>}</div>
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
              {debugEvents.length ? debugEvents.map((event, index) => <article className={`debug-event ${event.status}`} key={event.id}><span className="debug-rail">{index < debugEvents.length - 1 && <i />}</span><span className="debug-status-icon">{event.status === "running" ? <LoaderCircle size={14} className="spin" /> : event.status === "waiting" ? <MessageCircleQuestion size={14} /> : event.status === "routed" ? <Route size={14} /> : event.status === "error" ? <X size={14} /> : <Check size={14} />}</span><div><span><strong>{event.nodeName}</strong><small>{event.time}</small></span><b>{event.nodeType} · {event.status}</b><p>{event.detail}</p>{event.modelThinking && <details className="debug-thinking"><summary><BrainCircuit size={11} /> Model thinking</summary><pre>{event.modelThinking}</pre></details>}<DebugDataSection title="Inputs used" items={event.inputs} /><DebugDataSection title="Outputs produced" items={event.outputs} /></div></article>) : <div className="debug-empty"><Bug size={25} /><strong>No run recorded</strong><p>Send a message to see each workflow node execute here.</p></div>}
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
                  <button className="secondary-button ollama-test" onClick={() => refreshAvailableModels("ollama")} disabled={modelsLoading.ollama}><RefreshCw size={14} className={modelsLoading.ollama ? "spin" : ""} /> Load installed Ollama models</button>
                  {!!availableModels.ollama?.length && <div className="model-tags">{availableModels.ollama.map((model) => <span key={model}>{model}</span>)}</div>}
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
