"use client";

import {
  BrainCircuit,
  Braces,
  Bug,
  Box,
  Calculator,
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
  FileType,
  FolderOpen,
  GitBranch,
  HardDrive,
  History,
  Info,
  KeyRound,
  LayoutGrid,
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
  Ruler,
  Search,
  Shuffle,
  Save,
  ScanText,
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
  MouseEvent as ReactMouseEvent,
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
import { artifactFallbackJson, readStoredArtifact, writeStoredArtifact } from "../lib/artifact-storage";
import { fileNameFromAsset, firstFileAsset, getMediaDimensions } from "../lib/file-metadata";
import { evaluateBooleanRule, parseAIBoolean } from "../lib/boolean-condition";
import { rememberDirectoryPermission } from "../lib/directory-permission";
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
import { createPortableBundles, isZipFile, readPortableBundle, readPortableBundleParts } from "../lib/portable-bundle";
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
  createMathInput,
  evaluateMathExpression,
  growMathInputs,
  MathInputDefinition,
  mathInputVariable,
  MathOutputType,
} from "../lib/math-expression";
import {
  expandWorkflowSyntax,
  expandWorkflowSyntaxInValue,
  WORKFLOW_SYNTAX,
  WorkflowSyntaxContext,
} from "../lib/workflow-syntax";
import {
  createWorkflowTaskLimiter,
  DEFAULT_WORKFLOW_PARALLELISM,
  isWorkflowNodeActive,
  mapWithConcurrencyLimit,
  MAX_WORKFLOW_PARALLELISM,
  MIN_WORKFLOW_PARALLELISM,
  normalizeWorkflowParallelism,
  WorkflowTaskLimiter,
} from "../lib/workflow-scheduler";
import { recommendWorkflowParallelism, SystemPressureLevel } from "../lib/system-pressure";
import { displayNodeDirectory, migrateLegacyNodeDirectory, resolveNodeDirectory } from "../lib/node-directory";
import { collectWorkflowBundleDependencies, createWorkflowJsonBundle, portableDependencySegment, remapPackagedWorkflowIds, unpackWorkflowJsonBundle, workflowRuntimeNodeIds } from "../lib/workflow-bundle";
import { applyBundledLoadSnapshots, bundledLoadResult, BundledLoadSnapshot, materializedLoadDirectory } from "../lib/workflow-load-bundle";
import { workflowArchiveFilename, workflowExportFilename, workflowFileText } from "../lib/workflow-files";
import { organizeWorkflowNodes } from "../lib/workflow-layout";
import { createDebugLog, debugLogFilename } from "../lib/debug-log";
import { buildAIWorkAssignerSystemPrompt, parseAIWorkAssignments } from "../lib/ai-work-assigner";
import { composeStartInputs } from "../lib/start-inputs";
import { loadChatSession } from "../lib/chat-session-node";
import { bypassLegacyParallelNodes } from "../lib/workflow-migration";
import {
  applyUserMemoryOperation,
  formatUserMemory,
  formatUserSettings,
  MemoryOperation,
  normalizeUserMemories,
  UserMemory,
} from "../lib/user-personalization";
import {
  combineOcrResults,
  configuredOcrLanguages,
  OCR_LANGUAGE_OPTIONS,
  ocrOutputFileNames,
  visionOcrPrompt,
} from "../lib/ocr";
import type { OcrEngine, OcrResult } from "../lib/ocr";

type BuiltinNodeType = "start" | "chat-session" | "load-settings" | "update-memory" | "input" | "request" | "ai-assigner" | "workflow" | "string" | "integer" | "float" | "math" | "media-size" | "file-name" | "ocr" | "list-directory" | "save" | "load" | "set-state" | "transform" | "loop" | "retry" | "wait" | "code" | "parser" | "join" | "condition-ai" | "condition-rule" | "router-condition" | "router-ai" | "router-rule" | "end";
type NodeType = string;
type FileAsset = { name: string; type: string; data: string; size: number; bundleLoadNodeId?: string };
type PortDataType = "prompt" | "files" | "document" | "text" | "number" | "boolean" | "string" | "integer" | "float" | "image" | "video" | "audio" | "any";
type PortSpec = { id: string; label: string; type: PortDataType; multiple?: boolean };
type NodeSchema = { inputs: PortSpec[]; outputs: PortSpec[] };
type Point = { x: number; y: number };
type PortOffsets = Record<string, Point>;
type RouteOption = { id: string; label: string; value?: string; exportInstruction?: string };
type WorkflowContext = {
  userMessage: string;
  additionalInput?: string;
  loadedData?: string;
  lastOutput?: string;
  files: FileAsset[];
  values: Record<string, unknown>;
  syntax: WorkflowSyntaxContext;
  chatSession: {
    id: string;
    number: number;
    title: string;
    updatedAt: string;
    messages: Message[];
  };
  workflowStack?: string[];
  executionLimiter: WorkflowTaskLimiter;
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
    startIncludeCurrentMessage?: boolean;
    startIncludePriorUserMessages?: boolean;
    startIncludeAssistantMessages?: boolean;
    startIncludeSystemMessages?: boolean;
    startHistoryLimit?: number;
    startIncludeMessageTimes?: boolean;
    startIncludeCurrentFiles?: boolean;
    startIncludePriorFiles?: boolean;
    startIncludeSessionInfo?: boolean;
    startIncludeWorkflowInfo?: boolean;
    startIncludeStartSettings?: boolean;
    startIncludeRunDateTime?: boolean;
    startAdditionalContext?: string;
    sessionIncludeUserMessages?: boolean;
    sessionIncludeAssistantMessages?: boolean;
    sessionIncludeSystemMessages?: boolean;
    sessionHistoryLimit?: number;
    sessionIncludeMessageTimes?: boolean;
    sessionIncludeAttachments?: boolean;
    settingsIncludePreference?: boolean;
    settingsIncludeMemory?: boolean;
    memoryOperation?: MemoryOperation;
    memoryContent?: string;
    memoryId?: string;
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
    fileExtension?: string;
    collision?: "overwrite" | "timestamp" | "increment";
    loadMode?: "latest" | "all" | "exact" | "folder";
    directoryName?: string;
    directoryPath?: string;
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
    mathExpression?: string;
    mathInputs?: MathInputDefinition[];
    mathOutputType?: MathOutputType;
    includeExtension?: boolean;
    ocrEngine?: OcrEngine;
    ocrLanguages?: string;
    ocrPrimaryLanguage?: string;
    ocrAdditionalLanguages?: string;
    ocrModel?: string;
    ocrPdfScale?: number;
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
  bundledLoads?: Record<string, { value: string }>;
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
  fileSource?: string;
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
const WORKFLOW_DIRECTORY_HANDLE_KEY = "global:workflow";
const DEFAULT_LOCAL_DIRECTORY = "user-data";
const LOCAL_DIRECTORY_ENDPOINT = "/api/local-directory";

async function requestLocalDirectory<T>(body: Record<string, unknown>): Promise<T | null> {
  let response: Response;
  try {
    response = await fetch(LOCAL_DIRECTORY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return null;
  }
  const isJson = response.headers.get("content-type")?.includes("application/json");
  if (response.status === 404 || !isJson) return null;
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(result.error || "The configured directory could not be accessed.");
  return result;
}

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

async function rememberDirectoryHandle(key: string, handle: DirectoryHandle) {
  if (typeof indexedDB === "undefined") return;
  const database = await openDirectoryHandleDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(DIRECTORY_HANDLE_STORE, "readwrite");
    transaction.objectStore(DIRECTORY_HANDLE_STORE).put(handle, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

async function restoreDirectoryHandles() {
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

const NODE_META: Record<
  BuiltinNodeType,
  { label: string; subtitle: string; color: string; icon: typeof Play }
> = {
  start: { label: "Start", subtitle: "Entry point", color: "#27a36a", icon: Play },
  "chat-session": { label: "Chat Session", subtitle: "Load messages and session details", color: "#5279bd", icon: History },
  "load-settings": { label: "Load User Settings", subtitle: "Load preference and memory", color: "#6873c8", icon: Settings },
  "update-memory": { label: "Update User Memory", subtitle: "Add, edit, or remove a memory", color: "#9a5ca8", icon: BrainCircuit },
  input: { label: "Message", subtitle: "Prompt and file output", color: "#7c63e8", icon: MessageCircleQuestion },
  request: { label: "Request", subtitle: "Call an AI model", color: "#e17444", icon: Cloud },
  "ai-assigner": { label: "AI Work Assigner", subtitle: "Assign work to selected outputs", color: "#b95aa2", icon: BrainCircuit },
  workflow: { label: "Use Workflow", subtitle: "Run another workflow", color: "#6c68c9", icon: WorkflowIcon },
  string: { label: "String", subtitle: "Provide a string value", color: "#3689b5", icon: Variable },
  integer: { label: "Integer", subtitle: "Provide a whole number", color: "#b49332", icon: Variable },
  float: { label: "Float", subtitle: "Provide a decimal number", color: "#d09032", icon: Variable },
  math: { label: "Math", subtitle: "Calculate with named inputs", color: "#b66f36", icon: Calculator },
  "media-size": { label: "Get Image / Video Size", subtitle: "Read media dimensions", color: "#4d8fa2", icon: Ruler },
  "file-name": { label: "Get File Name", subtitle: "Read a file's name", color: "#6c8298", icon: FileType },
  ocr: { label: "OCR", subtitle: "Extract text from images and PDFs", color: "#287f8f", icon: ScanText },
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
  "condition-ai": { label: "AI Condition", subtitle: "AI-powered true / false", color: "#b6539d", icon: BrainCircuit },
  "condition-rule": { label: "Rule Condition", subtitle: "Rule-based true / false", color: "#3f806f", icon: GitBranch },
  "router-condition": { label: "Condition Router", subtitle: "Binary if / else routing", color: "#557f57", icon: Route },
  "router-ai": { label: "AI Router", subtitle: "Choose a path with AI", color: "#c05ca6", icon: BrainCircuit },
  "router-rule": { label: "Rule Router", subtitle: "Choose a path by rule", color: "#4d8f80", icon: Route },
  end: { label: "End", subtitle: "Return the result", color: "#d4565d", icon: CircleStop },
};

const BUILTIN_NODE_GROUPS: { id: string; label: string; types: BuiltinNodeType[] }[] = [
  { id: "essentials", label: "Essentials", types: ["start", "chat-session", "input", "end"] },
  { id: "personalization", label: "Personalization", types: ["load-settings", "update-memory"] },
  { id: "ai", label: "AI", types: ["request", "ai-assigner"] },
  { id: "values", label: "Values", types: ["string", "integer", "float", "math", "set-state"] },
  { id: "files", label: "Files", types: ["list-directory", "load", "save", "media-size", "file-name", "ocr"] },
  { id: "processing", label: "Processing", types: ["transform", "code", "parser", "join"] },
  { id: "flow-control", label: "Flow control", types: ["workflow", "loop", "retry", "wait"] },
  { id: "routing", label: "Routing", types: ["condition-ai", "condition-rule", "router-condition", "router-ai", "router-rule"] },
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

function getMathInputs(node: FlowNode) {
  return node.config.mathInputs?.length ? node.config.mathInputs : [createMathInput(1)];
}

function getNodeSchema(node: FlowNode, plugins: MagicConchPlugin[]): NodeSchema {
  const documentIn: PortSpec = { id: "document", label: "document", type: "document" };
  const documentOut: PortSpec = { id: "document", label: "document", type: "document" };
  const mediaInputs: PortSpec[] = [{ id: "image", label: "image", type: "image" }, { id: "video", label: "video", type: "video" }, { id: "audio", label: "audio", type: "audio" }];
  const mediaOutputs: PortSpec[] = [{ id: "image", label: "image", type: "image" }, { id: "video", label: "video", type: "video" }, { id: "audio", label: "audio", type: "audio" }];
  const fileInputs: PortSpec[] = [{ id: "files", label: "files", type: "files" }, ...mediaInputs, documentIn];
  if (node.type === "start") return { inputs: [{ id: "agent_name", label: "agent name", type: "string" }, { id: "start_message", label: "start message", type: "string" }], outputs: [{ id: "prompt", label: "prompt", type: "prompt" }, { id: "files", label: "files", type: "files" }, ...mediaOutputs, documentOut] };
  if (node.type === "chat-session") return {
    inputs: [],
    outputs: [
      { id: "history", label: "history", type: "prompt" },
      { id: "messages", label: "messages", type: "any" },
      { id: "session", label: "session", type: "any" },
      { id: "files", label: "files", type: "files" },
      ...mediaOutputs,
      documentOut,
      { id: "title", label: "title", type: "string" },
      { id: "session_id", label: "session ID", type: "string" },
      { id: "session_number", label: "session number", type: "integer" },
      { id: "message_count", label: "message count", type: "integer" },
      { id: "updated_at", label: "updated at", type: "string" },
    ],
  };
  if (node.type === "load-settings") return {
    inputs: [],
    outputs: [
      { id: "settings", label: "settings", type: "prompt" },
      { id: "preference", label: "preference", type: "text" },
      { id: "memory", label: "memory", type: "text" },
      { id: "memories", label: "memories", type: "any" },
      { id: "memory_count", label: "memory count", type: "integer" },
    ],
  };
  if (node.type === "update-memory") return {
    inputs: [
      { id: "content", label: "memory content", type: "text" },
      { id: "memory_id", label: "memory ID", type: "string" },
    ],
    outputs: [
      { id: "memory", label: "memory", type: "any" },
      { id: "memories", label: "memories", type: "any" },
      { id: "memory_text", label: "memory text", type: "text" },
      { id: "count", label: "count", type: "integer" },
      { id: "changed", label: "changed", type: "boolean" },
    ],
  };
  if (node.type === "input") return { inputs: [{ id: "prompt", label: "prompt", type: "prompt" }, { id: "question", label: "question", type: "string" }, { id: "files", label: "files", type: "files" }, ...mediaInputs, documentIn], outputs: [{ id: "prompt", label: "prompt", type: "prompt" }, { id: "files", label: "files", type: "files" }, ...mediaOutputs, documentOut] };
  if (node.type === "request") return { inputs: [{ id: "prompt", label: "prompt", type: "prompt" }, { id: "system_prompt", label: "system prompt", type: "string" }, { id: "model", label: "model", type: "string" }, { id: "temperature", label: "temperature", type: "float" }, { id: "output_file_name", label: "output file", type: "string" }, { id: "files", label: "files", type: "files" }, ...mediaInputs, documentIn], outputs: [{ id: "prompt", label: "prompt", type: "prompt" }, { id: "files", label: "files", type: "files" }, ...mediaOutputs, documentOut] };
  if (node.type === "ai-assigner") {
    const outputs = node.config.routeOptions?.length ? node.config.routeOptions : [{ id: "output-1", label: "Output 1" }];
    return {
      inputs: [{ id: "prompt", label: "prompt", type: "prompt" }, { id: "system_prompt", label: "system prompt", type: "string" }, { id: "model", label: "model", type: "string" }, { id: "temperature", label: "temperature", type: "float" }, ...fileInputs],
      outputs: outputs.map((option) => ({ id: option.id, label: option.label, type: "prompt" as const })),
    };
  }
  if (node.type === "workflow") return { inputs: [{ id: "prompt", label: "prompt", type: "prompt" }, { id: "files", label: "files", type: "files" }, ...mediaInputs, documentIn], outputs: [{ id: "prompt", label: "prompt", type: "prompt" }, { id: "files", label: "files", type: "files" }, ...mediaOutputs, documentOut] };
  if (node.type === "string") return { inputs: [], outputs: [{ id: "value", label: "value", type: "string" }] };
  if (node.type === "integer") return { inputs: [], outputs: [{ id: "value", label: "value", type: "integer" }] };
  if (node.type === "float") return { inputs: [], outputs: [{ id: "value", label: "value", type: "float" }] };
  if (node.type === "math") return {
    inputs: getMathInputs(node).map((input, index) => ({
      id: input.id,
      label: `{{${mathInputVariable(input, index)}}}`,
      type: "number",
    })),
    outputs: [{ id: "result", label: "result", type: node.config.mathOutputType || "float" }],
  };
  if (node.type === "media-size") return {
    inputs: [{ id: "files", label: "file", type: "files" }, { id: "image", label: "image", type: "image" }, { id: "video", label: "video", type: "video" }],
    outputs: [{ id: "width", label: "width", type: "integer" }, { id: "height", label: "height", type: "integer" }],
  };
  if (node.type === "file-name") return {
    inputs: [{ id: "files", label: "file", type: "files" }, ...mediaInputs, documentIn],
    outputs: [{ id: "name", label: "name", type: "string" }],
  };
  if (node.type === "ocr") return {
    inputs: [{ id: "files", label: "files", type: "files" }, { id: "image", label: "images", type: "image" }, documentIn],
    outputs: [
      { id: "text", label: "text", type: "text" },
      { id: "results", label: "results", type: "any" },
      { id: "files", label: "OCR files", type: "files" },
      { id: "count", label: "count", type: "integer" },
    ],
  };
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
  if (node.type === "condition-ai" || node.type === "condition-rule") {
    return {
      inputs: [{ id: "value", label: "value", type: "any" }, { id: "gate", label: "if / elif gate", type: "boolean" }, ...fileInputs],
      outputs: [{ id: "true", label: "true / if", type: "boolean" }, { id: "false", label: "false / else", type: "boolean" }],
    };
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
      inputs: [{ id: "prompt", label: "prompt", type: "prompt" }, ...fileInputs],
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
  return 86 + Math.max(schema.inputs.length, schema.outputs.length) * 25 + (["ai-assigner", "router-ai", "router-rule"].includes(node.type) ? 27 : 0);
}

function migrateWorkflow(workflow: Workflow, plugins: MagicConchPlugin[]): Workflow {
  workflow = bypassLegacyParallelNodes(workflow);
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

  const nodes = workflow.nodes.map((originalNode) => {
    const config = { ...migrateLegacyNodeDirectory(originalNode.config) } as FlowNode["config"] & { startIncludeWorkflowFiles?: boolean };
    delete config.startIncludeWorkflowFiles;
    const node = { ...originalNode, config };
    if (node.type === "math") {
      const inputs = node.config.mathInputs?.length ? [...node.config.mathInputs] : [];
      const incomingIds = [...new Set(migrated
        .filter((edge) => edge.to === node.id)
        .map((edge) => edge.toPort)
        .filter((id): id is string => Boolean(id)))];
      if (!inputs.length) incomingIds.forEach((id, index) => inputs.push(createMathInput(index + 1, id)));
      if (!inputs.length) inputs.push(createMathInput(1));
      const connectedIds = new Set(incomingIds);
      const lastInputId = inputs.at(-1)?.id;
      if (lastInputId && connectedIds.has(lastInputId)) inputs.push(createMathInput(inputs.length + 1));
      return { ...node, config: { ...node.config, mathInputs: inputs } };
    }
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

  const bundledNodeIds = new Set(Object.keys(workflow.bundledLoads || {}));
  const files = (workflow.files || []).filter((file) => file.bundleLoadNodeId && bundledNodeIds.has(file.bundleLoadNodeId));
  return {
    ...workflow,
    version: Math.max(4, workflow.version || 1),
    nodes,
    edges: migrated,
    files: files.length ? files : undefined,
  };
}

async function materializeWorkflowLoadFiles(workflow: Workflow) {
  if (!workflow.bundledLoads || !Object.keys(workflow.bundledLoads).length) return workflow;
  let nodes = workflow.nodes;
  let files = workflow.files || [];
  const remainingLoads = { ...workflow.bundledLoads };
  for (const nodeId of Object.keys(workflow.bundledLoads)) {
    const node = nodes.find((candidate) => candidate.id === nodeId);
    const snapshot = bundledLoadResult({ ...workflow, nodes, files, bundledLoads: remainingLoads }, nodeId);
    if (!node || !snapshot || (node.type !== "load" && node.type !== "list-directory")) continue;
    const directory = materializedLoadDirectory(workflow, node);
    const recordKey = node.config.key || "workflow-result";
    try {
      const result = await requestLocalDirectory<{ files: string[] }>({
        operation: "materialize-load",
        directory,
        key: recordKey,
        fileExtension: node.config.fileExtension || "json",
        value: snapshot.value,
        files: snapshot.files,
        writeRecord: node.type === "load" && node.config.loadMode !== "folder",
      });
      if (!result) continue;
    } catch {
      // Keep the embedded snapshot when the local filesystem is unavailable.
      continue;
    }
    nodes = nodes.map((candidate) => candidate.id === nodeId ? {
      ...candidate,
      config: {
        ...candidate.config,
        directoryPath: directory,
        directoryName: undefined,
        subfolder: "",
      },
    } : candidate);
    files = files.filter((file) => file.bundleLoadNodeId !== nodeId);
    delete remainingLoads[nodeId];
  }
  return {
    ...workflow,
    nodes,
    files,
    bundledLoads: Object.keys(remainingLoads).length ? remainingLoads : undefined,
  };
}

function workflowJsonManifest(workflow: Workflow): Workflow {
  const manifest = { ...workflow };
  delete manifest.files;
  delete manifest.bundledLoads;
  return manifest;
}

function evaluateRouteRule(node: FlowNode, prompt: string, files: FileAsset[], optionValue?: string) {
  return evaluateBooleanRule(prompt, files, {
    method: node.config.routeMethod,
    expected: optionValue ?? node.config.routeValue,
    caseSensitive: node.config.caseSensitive,
  });
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
  version: 4,
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

function startInputDetails(
  start: FlowNode,
  workflow: Workflow,
  currentMessage: string,
  currentFiles: FileAsset[],
  priorMessages: Message[],
  syntax: WorkflowSyntaxContext,
) {
  return composeStartInputs(start.config, {
    currentMessage,
    currentFiles,
    priorMessages,
    session: {
      id: syntax.chatSessionId,
      number: syntax.chatSessionNumber,
      title: syntax.chatSessionTitle,
    },
    workflow: { name: workflow.name, description: workflow.description },
    start: getStartSettings(workflow, syntax),
    now: syntax.now,
    expand: (value) => expandWorkflowSyntax(value, syntax),
  });
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

const LEGACY_AI_WORK_ASSIGNER_SYSTEM_PROMPT = "Assign the request only to the outputs that should work on it.";
const DEFAULT_AI_WORK_ASSIGNER_SYSTEM_PROMPT = [
  "You are a work coordinator. Analyze the incoming request and delegate it to the available outputs according to their names and intended roles.",
  "",
  "Selection rules:",
  "- Activate every output whose role is genuinely useful for completing the request.",
  "- Activate multiple outputs when the work benefits from parallel or complementary contributions.",
  "- Leave an output inactive when it has no meaningful work to perform.",
  "- Avoid assigning the same work to several outputs unless independent approaches are valuable.",
  "",
  "Prompt requirements for each activated output:",
  "- Write a complete, standalone instruction that can be sent directly to another AI model.",
  "- Include the relevant context from the incoming request; do not assume the downstream model can see the original message.",
  "- State the specific task, expected deliverable, important constraints, and useful quality criteria.",
  "- Keep the assignment focused on that output's role while preserving the user's intent.",
  "- Do not ask one output to wait for or communicate with another output.",
].join("\n");

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
  const [workflowContextMenu, setWorkflowContextMenu] = useState<{ workflowId: string; x: number; y: number } | null>(null);
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
  const [settingsTab, setSettingsTab] = useState<"general" | "personalization" | "api" | "plugins">("api");
  const [providerSettings, setProviderSettings] = useState<ProviderSettings>({
    ollamaUrl: "http://localhost:11434",
  });
  const [availableModels, setAvailableModels] = useState<Partial<Record<AIProvider, string[]>>>({});
  const [modelsLoading, setModelsLoading] = useState<Partial<Record<AIProvider, boolean>>>({});
  const [plugins, setPlugins] = useState<MagicConchPlugin[]>([]);
  const [nodeSearch, setNodeSearch] = useState("");
  const [collapsedNodeGroups, setCollapsedNodeGroups] = useState<Record<string, boolean>>({});
  const [undoLimit, setUndoLimit] = useState(50);
  const [workflowParallelism, setWorkflowParallelism] = useState(DEFAULT_WORKFLOW_PARALLELISM);
  const [automaticWorkflowParallelism, setAutomaticWorkflowParallelism] = useState(true);
  const [automaticParallelism, setAutomaticParallelism] = useState(DEFAULT_WORKFLOW_PARALLELISM);
  const [systemPressureLevel, setSystemPressureLevel] = useState<SystemPressureLevel>("low");
  const [defaultDirectoryPath, setDefaultDirectoryPath] = useState(DEFAULT_LOCAL_DIRECTORY);
  const [userPreference, setUserPreference] = useState("");
  const [userMemories, setUserMemories] = useState<UserMemory[]>([]);
  const [newMemoryContent, setNewMemoryContent] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<FileAsset[]>([]);
  const [workflowFolder, setWorkflowFolder] = useState<DirectoryHandle | null>(null);
  const [pendingInput, setPendingInput] = useState<PendingWorkflowInput | null>(null);
  const [portOffsets, setPortOffsets] = useState<PortOffsets>({});

  const canvasRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pluginInputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  function replaceUserMemories(next: UserMemory[] | ((current: UserMemory[]) => UserMemory[])) {
    const resolved = typeof next === "function" ? next(userMemoriesRef.current) : next;
    userMemoriesRef.current = resolved;
    setUserMemories(resolved);
  }
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
  const userMemoriesRef = useRef<UserMemory[]>([]);
  const storageWarningShownRef = useRef(false);
  const artifactStorageWarningShownRef = useRef(false);
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
  const effectiveWorkflowParallelism = automaticWorkflowParallelism ? automaticParallelism : workflowParallelism;
  const workflowParallelismRef = useRef(effectiveWorkflowParallelism);
  workflowParallelismRef.current = effectiveWorkflowParallelism;

  const activeWorkflow = useMemo(
    () => workflows.find((workflow) => workflow.id === activeWorkflowId) ?? workflows[0],
    [activeWorkflowId, workflows],
  );
  const activeChatSession = useMemo(
    () => chatSessions.find((session) => session.id === activeSessionId) ?? initialChatSession,
    [activeSessionId, chatSessions],
  );
  useEffect(() => {
    let active = true;
    restoreDirectoryHandles()
      .then((handles) => {
        if (!active) return;
        setWorkflowFolder(handles[WORKFLOW_DIRECTORY_HANDLE_KEY] || null);
      })
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
        const savedFlowsJson = localStorage.getItem("magic-conch-workflows");
        const savedSettings = localStorage.getItem("magic-conch-provider-settings");
        const savedPluginsJson = localStorage.getItem("magic-conch-plugins");
        const savedUndoLimit = localStorage.getItem("magic-conch-undo-limit");
        const savedWorkflowParallelism = localStorage.getItem("magic-conch-workflow-parallelism");
        const savedAutomaticWorkflowParallelism = localStorage.getItem("magic-conch-workflow-parallelism-auto");
        const savedDefaultDirectory = localStorage.getItem("magic-conch-default-directory");
        const savedUserPreference = localStorage.getItem("magic-conch-user-preference");
        const savedUserMemories = localStorage.getItem("magic-conch-user-memories");
        const savedSessionsJson = localStorage.getItem("magic-conch-chat-sessions");
        const [indexedFlows, indexedPlugins, indexedSessions] = await Promise.all([
          readStoredArtifact<Workflow[]>("workflows").catch(() => null),
          readStoredArtifact<MagicConchPlugin[]>("plugins").catch(() => null),
          readStoredChatSessions<Partial<ChatSession>[]>().catch(() => null),
        ]);
        const savedFlows = indexedFlows ?? (savedFlowsJson ? JSON.parse(savedFlowsJson) as Workflow[] : null);
        const savedPlugins = indexedPlugins ?? (savedPluginsJson ? JSON.parse(savedPluginsJson) as MagicConchPlugin[] : []);
        const savedSessions = indexedSessions ?? (savedSessionsJson ? JSON.parse(savedSessionsJson) as Partial<ChatSession>[] : null);
        const savedChatFolders = localStorage.getItem("magic-conch-chat-folders");
        const savedActiveSession = localStorage.getItem("magic-conch-active-session");
        const restoredPlugins = savedPlugins;
        if (savedFlows) {
          const parsed = savedFlows;
          if (parsed.length) {
            const migrated = parsed.map((workflow) => migrateWorkflow({
              ...workflow,
              nodes: workflow.nodes.map((node) => {
                if (node.type === "ai-assigner" && node.config.systemPrompt === LEGACY_AI_WORK_ASSIGNER_SYSTEM_PROMPT) {
                  return { ...node, config: { ...node.config, systemPrompt: DEFAULT_AI_WORK_ASSIGNER_SYSTEM_PROMPT } };
                }
                if ((node.type === "router-ai" || node.type === "router-rule") && !node.config.routeOptions?.length) {
                  return {
                    ...node,
                    config: {
                      ...node.config,
                      routeOptions: [
                        { id: "route-1", label: node.config.routeALabel || "Option 1", value: node.config.routeValue || "" },
                        ...(node.config.routeBLabel ? [{ id: "route-2", label: node.config.routeBLabel, value: "" }] : []),
                      ],
                    },
                  };
                }
                return node;
              }),
              edges: workflow.edges.map((edge) => ({
                ...edge,
                fromPort: edge.fromPort === "route-a" ? "route-1" : edge.fromPort === "route-b" ? "route-2" : edge.fromPort || "flow",
                toPort: edge.toPort || "flow",
                dataType: edge.dataType || "flow",
              })),
            }, restoredPlugins));
            const materialized: Workflow[] = [];
            for (const workflow of migrated) materialized.push(await materializeWorkflowLoadFiles(workflow));
            setWorkflows(materialized);
            setActiveWorkflowId(materialized[0].id);
          }
        }
        if (savedSettings) setProviderSettings(JSON.parse(savedSettings));
        if (restoredPlugins.length) setPlugins(restoredPlugins);
        if (savedUndoLimit) setUndoLimit(Math.max(1, Math.min(500, Number(savedUndoLimit))));
        if (savedWorkflowParallelism) setWorkflowParallelism(normalizeWorkflowParallelism(savedWorkflowParallelism));
        setAutomaticWorkflowParallelism(savedAutomaticWorkflowParallelism === null
          ? !savedWorkflowParallelism
          : savedAutomaticWorkflowParallelism === "true");
        if (savedDefaultDirectory) setDefaultDirectoryPath(savedDefaultDirectory);
        if (savedUserPreference) setUserPreference(savedUserPreference);
        if (savedUserMemories) replaceUserMemories(normalizeUserMemories(JSON.parse(savedUserMemories)));
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
        if (!indexedFlows && savedFlowsJson) {
          await writeStoredArtifact("workflows", savedFlows)
            .then(() => localStorage.removeItem("magic-conch-workflows"))
            .catch(() => { /* The lightweight localStorage fallback remains available. */ });
        } else if (indexedFlows) {
          localStorage.removeItem("magic-conch-workflows");
        }
        if (!indexedPlugins && savedPluginsJson) {
          await writeStoredArtifact("plugins", restoredPlugins)
            .then(() => localStorage.removeItem("magic-conch-plugins"))
            .catch(() => { /* The lightweight localStorage fallback remains available. */ });
        } else if (indexedPlugins) {
          localStorage.removeItem("magic-conch-plugins");
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
    const save = window.setTimeout(() => {
      writeStoredArtifact("workflows", workflows)
        .then(() => localStorage.removeItem("magic-conch-workflows"))
        .catch(() => {
          try {
            localStorage.setItem("magic-conch-workflows", artifactFallbackJson(workflows));
          } catch {
            if (!artifactStorageWarningShownRef.current) {
              artifactStorageWarningShownRef.current = true;
              showToast("Workflow changes are available now, but this browser could not save the large bundled files");
            }
          }
        });
    }, 200);
    return () => window.clearTimeout(save);
  }, [workflows]);

  useEffect(() => {
    if (!storageRestoredRef.current) return;
    localStorage.setItem("magic-conch-provider-settings", JSON.stringify(providerSettings));
  }, [providerSettings]);

  useEffect(() => {
    if (!storageRestoredRef.current) return;
    const save = window.setTimeout(() => {
      writeStoredArtifact("plugins", plugins)
        .then(() => localStorage.removeItem("magic-conch-plugins"))
        .catch(() => {
          try {
            localStorage.setItem("magic-conch-plugins", artifactFallbackJson(plugins));
          } catch {
            if (!artifactStorageWarningShownRef.current) {
              artifactStorageWarningShownRef.current = true;
              showToast("Plug-ins are available now, but this browser could not save their bundled files");
            }
          }
        });
    }, 200);
    return () => window.clearTimeout(save);
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
    localStorage.setItem("magic-conch-workflow-parallelism", String(workflowParallelism));
  }, [workflowParallelism]);

  useEffect(() => {
    if (!storageRestoredRef.current) return;
    localStorage.setItem("magic-conch-workflow-parallelism-auto", String(automaticWorkflowParallelism));
  }, [automaticWorkflowParallelism]);

  useEffect(() => {
    type MemoryPerformance = Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } };
    type MemoryNavigator = Navigator & { deviceMemory?: number };
    type PressureRecord = { state: "nominal" | "fair" | "serious" | "critical" };
    type PressureObserverInstance = { observe: (source: "cpu", options?: { sampleInterval?: number }) => Promise<void>; disconnect: () => void };
    type PressureObserverConstructor = new (callback: (records: PressureRecord[]) => void) => PressureObserverInstance;

    let cpuPressure: PressureRecord["state"] | undefined;
    let expected = performance.now() + 2000;
    let observer: PressureObserverInstance | undefined;
    const update = () => {
      const now = performance.now();
      const eventLoopLagMs = Math.max(0, now - expected);
      expected = now + 2000;
      const memory = (performance as MemoryPerformance).memory;
      const recommendation = recommendWorkflowParallelism({
        hardwareConcurrency: navigator.hardwareConcurrency,
        deviceMemoryGb: (navigator as MemoryNavigator).deviceMemory,
        heapUtilization: memory?.jsHeapSizeLimit ? memory.usedJSHeapSize / memory.jsHeapSizeLimit : undefined,
        eventLoopLagMs,
        cpuPressure,
      });
      setAutomaticParallelism(recommendation.limit);
      setSystemPressureLevel(recommendation.level);
    };
    update();
    const timer = window.setInterval(update, 2000);
    const PressureObserver = (window as unknown as { PressureObserver?: PressureObserverConstructor }).PressureObserver;
    if (PressureObserver) {
      try {
        observer = new PressureObserver((records) => {
          cpuPressure = records.at(-1)?.state;
          update();
        });
        void observer.observe("cpu", { sampleInterval: 2000 }).catch(() => observer?.disconnect());
      } catch { /* Capacity, heap, and event-loop signals remain available. */ }
    }
    return () => {
      window.clearInterval(timer);
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!storageRestoredRef.current) return;
    localStorage.setItem("magic-conch-default-directory", defaultDirectoryPath.trim() || DEFAULT_LOCAL_DIRECTORY);
  }, [defaultDirectoryPath]);

  useEffect(() => {
    if (!storageRestoredRef.current) return;
    localStorage.setItem("magic-conch-user-preference", userPreference);
  }, [userPreference]);

  useEffect(() => {
    if (!storageRestoredRef.current) return;
    localStorage.setItem("magic-conch-user-memories", JSON.stringify(userMemories));
  }, [userMemories]);

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

  useEffect(() => {
    if (!workflowContextMenu) return;
    const closeMenu = () => setWorkflowContextMenu(null);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    window.addEventListener("pointerdown", closeMenu);
    window.addEventListener("blur", closeMenu);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("blur", closeMenu);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [workflowContextMenu]);

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
    data: { inputs?: DebugDatum[]; outputs?: DebugDatum[]; fileSource?: string } = {},
  ) {
    const id = uid("debug");
    setDebugEvents((current) => [
      ...current,
      { id, nodeId: node.id, nodeName: node.name, nodeType: getNodeMeta(node.type, plugins).label, status, detail, time: timeNow(), inputs: data.inputs || [], outputs: data.outputs || [], fileSource: data.fileSource },
    ]);
    return id;
  }

  function updateDebugEvent(
    id: string,
    status: DebugEvent["status"],
    detail: string,
    data: { inputs?: DebugDatum[]; outputs?: DebugDatum[]; fileSource?: string; modelThinking?: string } = {},
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
        type === "load-settings"
          ? { settingsIncludePreference: true, settingsIncludeMemory: true }
          : type === "update-memory"
            ? { memoryOperation: "add", memoryContent: "", memoryId: "" }
          : type === "request"
          ? { provider: "openai", model: modelDefaults.openai, temperature: 0.7 }
          : type === "chat-session"
            ? { sessionIncludeUserMessages: true, sessionIncludeAssistantMessages: true, sessionIncludeSystemMessages: false, sessionHistoryLimit: 20, sessionIncludeMessageTimes: false, sessionIncludeAttachments: true }
          : type === "ai-assigner"
            ? { provider: "openai", model: modelDefaults.openai, temperature: 0.2, systemPrompt: DEFAULT_AI_WORK_ASSIGNER_SYSTEM_PROMPT, routeOptions: [{ id: uid("output"), label: "Output 1" }] }
          : type === "workflow"
            ? { calledWorkflowId: workflows.find((workflow) => workflow.id !== activeWorkflow.id)?.id || "" }
          : type === "string"
            ? { stringValue: "" }
            : type === "integer"
              ? { integerValue: 0 }
              : type === "float"
                ? { floatValue: 0 }
                : type === "math"
                  ? { mathExpression: "{{input1}}", mathOutputType: "float", mathInputs: [createMathInput(1)] }
                  : type === "file-name"
                    ? { includeExtension: true }
                    : type === "ocr"
                      ? { ocrEngine: "tesseract", ocrLanguages: "eng", ocrPrimaryLanguage: "eng", ocrAdditionalLanguages: "", ocrPdfScale: 2 }
                : type === "list-directory"
                  ? { subfolder: "", includeSubfolders: false }
          : type === "input"
            ? { prompt: "What additional information should I know?" }
            : type === "save"
              ? { key: "record-name", fileExtension: "json", collision: "increment", saveFiles: "both" }
              : type === "load"
                ? { key: "record-name", fileExtension: "json", loadMode: "latest" }
                : type === "condition-ai"
                  ? { provider: "openai", model: modelDefaults.openai, temperature: 0, routeCriteria: "Return true when the input satisfies this condition." }
                  : type === "condition-rule"
                    ? { routeMethod: "contains", routeValue: "urgent", caseSensitive: false }
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
          if (node.id === targetId && node.type === "math") {
            const inputs = getMathInputs(node);
            const mathInputs = growMathInputs(inputs, targetPort, uid("math-input"));
            if (mathInputs !== inputs) return { ...node, config: { ...node.config, mathInputs } };
          }
          if (node.id === source.nodeId && ["ai-assigner", "router-ai", "router-rule"].includes(node.type)) {
            const fallbackLabel = node.type === "ai-assigner" ? "Output 1" : "Option 1";
            const options = node.config.routeOptions?.length ? node.config.routeOptions : [{ id: source.portId, label: fallbackLabel, value: node.config.routeValue || "" }];
            if (options.at(-1)?.id === source.portId) {
              const label = node.type === "ai-assigner" ? "Output" : "Option";
              return { ...node, config: { ...node.config, routeOptions: [...options, { id: uid(node.type === "ai-assigner" ? "output" : "route"), label: `${label} ${options.length + 1}`, value: "" }] } };
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
        const outputName = node.type === "ai-assigner" ? "Output" : "Option";
        return { ...node, config: { ...node.config, routeOptions: [...options, { id: uid(node.type === "ai-assigner" ? "output" : "route"), label: `${outputName} ${options.length + 1}`, value: "" }] } };
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
      version: 4,
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

  function openWorkflowCanvasContextMenu(event: ReactMouseEvent) {
    const target = event.target as Element;
    if (target.closest(".flow-node, .edge-group, .zoom-controls")) return;
    event.preventDefault();
    event.stopPropagation();
    const menuWidth = 190;
    const menuHeight = 176;
    setWorkflowContextMenu({
      workflowId: activeWorkflowId,
      x: Math.min(event.clientX, window.innerWidth - menuWidth - 8),
      y: Math.min(event.clientY, window.innerHeight - menuHeight - 8),
    });
  }

  function organizeWorkflow(workflowId: string) {
    setWorkflows((current) => current.map((workflow) => {
      if (workflow.id !== workflowId) return workflow;
      rememberWorkflow(workflow);
      return {
        ...workflow,
        nodes: organizeWorkflowNodes(workflow.nodes, workflow.edges, {
          nodeHeight: (node) => nodeCardHeight(node, plugins),
        }),
        updatedAt: new Date().toISOString(),
      };
    }));
    setWorkflowContextMenu(null);
    showToast("Nodes organized");
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

  function localRecordKey(safeKey: string, fileExtension: string, segments: string[]) {
    const extensionSuffix = fileExtension === "json" ? "" : `.${fileExtension}`;
    return `magic-conch-record:${segments.length ? `${segments.join("/")}/` : ""}${safeKey}${extensionSuffix}`;
  }

  function configuredDefaultDirectory() {
    return defaultDirectoryPath.trim() || DEFAULT_LOCAL_DIRECTORY;
  }

  function resolvedDirectoryForNode(node: FlowNode, subfolder = node.config.subfolder || "") {
    return resolveNodeDirectory(node.config, configuredDefaultDirectory(), subfolder);
  }

  async function localDirectoryRequest<T>(body: Record<string, unknown>): Promise<T | null> {
    return requestLocalDirectory<T>({ directory: configuredDefaultDirectory(), ...body });
  }

  async function chooseWorkflowFolder() {
    const picker = (window as unknown as {
      showDirectoryPicker?: (options?: { id?: string; mode?: "read" | "readwrite" }) => Promise<DirectoryHandle>;
    })
      .showDirectoryPicker;
    if (!picker) {
      showToast("Folder access needs Chrome, Edge, or the desktop app");
      return;
    }
    try {
      const handle = await picker({
        id: "magic-conch-workflows",
        mode: "readwrite",
      });
      rememberDirectoryPermission(handle, "readwrite");
      setWorkflowFolder(handle);
      await rememberDirectoryHandle(WORKFLOW_DIRECTORY_HANDLE_KEY, handle).catch(() => { /* The handle remains usable for this session. */ });
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

  async function addMessageFiles(event: ChangeEvent<HTMLInputElement>) {
    const assets = await Promise.all(Array.from(event.target.files || []).map(readFileAsset));
    setAttachedFiles((current) => [...current, ...assets]);
    event.target.value = "";
  }

  async function importPlugin(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const value = isZipFile(file)
        ? readPortableBundle(new Uint8Array(await file.arrayBuffer()), "plugin.json")
        : JSON.parse(workflowFileText(await file.text()));
      const plugin = validatePlugin(value);
      setPlugins((current) => [...current.filter((item) => item.id !== plugin.id), plugin]);
      showToast(`${plugin.name} installed${plugin.files?.length ? ` with ${plugin.files.length} file${plugin.files.length === 1 ? "" : "s"}` : ""}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Invalid plug-in manifest");
    }
    event.target.value = "";
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
      await writeJsonToFolder(workflowFolder, filename, workflowJsonManifest(activeWorkflow));
      showToast(`Saved to ${workflowFolder.name}`);
    } else {
      showToast("Saved in this browser");
    }
  }

  function exportWorkflow() {
    const bundled = collectWorkflowBundleDependencies(activeWorkflow, workflows, []);
    const exported = createWorkflowJsonBundle(bundled.workflows.map(workflowJsonManifest));
    const json = JSON.stringify(exported, null, 2);
    const blob = new Blob([new TextEncoder().encode(json)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = workflowExportFilename(activeWorkflow.name);
    link.click();
    URL.revokeObjectURL(url);
    const dependencyCount = bundled.workflows.length - 1;
    showToast(dependencyCount
      ? `Workflow exported with ${dependencyCount} dependent workflow${dependencyCount === 1 ? "" : "s"}`
      : "Workflow exported");
  }

  function exportDebugLog() {
    const exportedAt = new Date();
    const debugLog = createDebugLog({
      exportedAt: exportedAt.toISOString(),
      chat: {
        id: activeChatSession.id,
        title: activeChatSession.title,
        sessionNumber: activeChatSession.sessionNumber,
        updatedAt: activeChatSession.updatedAt,
        messages,
      },
      workflow: {
        id: activeWorkflow.id,
        name: activeWorkflow.name,
        version: activeWorkflow.version,
        updatedAt: activeWorkflow.updatedAt,
      },
      run: {
        status: isRunning ? "running" : "idle",
        stepCount: debugEvents.length,
        events: debugEvents,
      },
    });
    const blob = new Blob([JSON.stringify(debugLog, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = debugLogFilename(activeChatSession.title, exportedAt);
    link.click();
    URL.revokeObjectURL(url);
    showToast("Debug log exported");
  }

  async function captureWorkflowLoadFiles(workflow: Workflow) {
    const snapshots: Record<string, BundledLoadSnapshot<FileAsset>> = {};
    const runtimeNodeIds = workflowRuntimeNodeIds(workflow);
    for (const sourceNode of workflow.nodes.filter((node) => runtimeNodeIds.has(node.id) && (node.type === "load" || node.type === "list-directory"))) {
      const existing = bundledLoadResult(workflow, sourceNode.id);
      if (existing) {
        snapshots[sourceNode.id] = existing;
        continue;
      }
      const syntax = syntaxContextFor(workflow);
      const node = expandWorkflowSyntaxInValue(sourceNode, syntax);
      const effectiveNode = {
        ...node,
        config: {
          ...node.config,
          key: expandWorkflowSyntax(String(connectedConfiguredValue(workflow, node.id, "key") ?? node.config.key ?? "workflow-result"), syntax),
          subfolder: expandWorkflowSyntax(String(connectedConfiguredValue(workflow, node.id, "subfolder") ?? node.config.subfolder ?? ""), syntax),
        },
      };
      try {
        if (node.type === "list-directory" || node.config.loadMode === "folder") {
          const recursive = Boolean(connectedConfiguredValue(workflow, node.id, "recursive") ?? node.config.includeSubfolders ?? false);
          const loadedDirectory = await loadDirectoryFiles(effectiveNode, effectiveNode.config.subfolder || "", recursive);
          const files = loadedDirectory.files;
          snapshots[node.id] = { value: files.map((file) => file.name).join("\n"), files };
        } else {
          snapshots[node.id] = await loadRecord(effectiveNode);
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : "The configured source could not be read.";
        throw new Error(`Could not include runtime files for “${node.name}” in “${workflow.name}”: ${reason}`);
      }
    }
    return applyBundledLoadSnapshots(workflow, snapshots);
  }

  async function exportWorkflowWithFiles() {
    try {
      const bundled = collectWorkflowBundleDependencies(activeWorkflow, workflows, plugins);
      const preparedWorkflows: Workflow[] = [];
      for (const workflow of bundled.workflows) preparedWorkflows.push(await captureWorkflowLoadFiles(workflow));
      const parts = [
        { manifest: preparedWorkflows[0], manifestPath: "workflow.json" },
        ...preparedWorkflows.slice(1).map((workflow, index) => ({
          manifest: workflow,
          manifestPath: `dependencies/workflows/${index + 1}-${portableDependencySegment(workflow.id)}/workflow.json`,
        })),
        ...bundled.plugins.map((plugin, index) => ({
          manifest: plugin,
          manifestPath: `dependencies/plugins/${index + 1}-${portableDependencySegment(plugin.id)}/plugin.json`,
        })),
      ];
      const blob = new Blob([new Uint8Array(createPortableBundles(parts))], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = workflowArchiveFilename(activeWorkflow.name);
      link.click();
      URL.revokeObjectURL(url);
      const fileCount = preparedWorkflows.reduce((total, workflow) => total + (workflow.files?.length || 0), 0)
        + bundled.plugins.reduce((total, plugin) => total + (plugin.files?.length || 0), 0);
      showToast(`Workflow exported with ${fileCount} file${fileCount === 1 ? "" : "s"} and all used dependencies`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not export workflow files");
    }
  }

  async function importWorkflowFile(file: File): Promise<boolean> {
    try {
      let packagedWorkflows: Workflow[];
      let packagedPlugins: MagicConchPlugin[] = [];
      if (isZipFile(file)) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const workflowParts = readPortableBundleParts(bytes, "workflow.json");
        const rootPart = workflowParts.find((part) => part.manifestPath.toLocaleLowerCase() === "workflow.json")
          || [...workflowParts].sort((a, b) => a.manifestPath.length - b.manifestPath.length)[0];
        if (!rootPart) throw new Error("The ZIP does not contain workflow.json.");
        packagedWorkflows = [
          rootPart.manifest as Workflow,
          ...workflowParts.filter((part) => part !== rootPart).map((part) => part.manifest as Workflow),
        ];
        packagedPlugins = readPortableBundleParts(bytes, "plugin.json").map((part) => validatePlugin(part.manifest));
      } else {
        packagedWorkflows = unpackWorkflowJsonBundle<Workflow>(JSON.parse(workflowFileText(await file.text())));
      }
      if (packagedWorkflows.some((workflow) => !workflow.nodes || !workflow.edges || !workflow.name)) throw new Error();
      packagedWorkflows = packagedWorkflows.map((workflow, index) => ({
        ...workflow,
        id: workflow.id || `packaged-workflow-${index + 1}`,
      }));
      if (new Set(packagedWorkflows.map((workflow) => workflow.id)).size !== packagedWorkflows.length) {
        throw new Error("The workflow bundle contains duplicate workflow ids.");
      }

      const availablePlugins = [
        ...plugins.filter((plugin) => !packagedPlugins.some((packaged) => packaged.id === plugin.id)),
        ...packagedPlugins,
      ];
      const migrated = remapPackagedWorkflowIds(packagedWorkflows, () => uid("workflow")).map((workflow) => migrateWorkflow({
        ...workflow,
        updatedAt: new Date().toISOString(),
      }, availablePlugins));
      const imported: Workflow[] = [];
      for (const workflow of migrated) imported.push(await materializeWorkflowLoadFiles(workflow));
      if (packagedPlugins.length) setPlugins(availablePlugins);
      setWorkflows((current) => [...current, ...imported]);
      setActiveWorkflowId(imported[0].id);
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
    const fileExtension = node.config.fileExtension?.trim().replace(/^\.+/, "").toLowerCase() || "json";
    const location = resolvedDirectoryForNode(node);
    const segments = location.subfolder;
    const localResult = await localDirectoryRequest<{ record: { files: string[] } }>({
      directory: location.directory,
      operation: "save-record",
      subfolder: segments,
      key: safeKey,
      fileExtension,
      value,
      files,
      saveFiles: node.config.saveFiles || "both",
      collision: node.config.collision || "increment",
    });
    const record = {
      key: safeKey,
      value,
      files: localResult?.record.files || [],
      // Hosted builds without the local bridge retain assets in browser storage.
      assets: !localResult && node.config.saveFiles !== "data" ? files : undefined,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(localRecordKey(safeKey, fileExtension, segments), JSON.stringify(record));
  }

  async function loadRecord(node: FlowNode) {
    const safeKey = (node.config.key || "workflow-result").replace(/[^a-zA-Z0-9-_]/g, "-");
    const fileExtension = node.config.fileExtension?.trim().replace(/^\.+/, "").toLowerCase() || "json";
    const location = resolvedDirectoryForNode(node);
    const segments = location.subfolder;
    type StoredRecord = { value?: unknown; files?: string[]; assets?: FileAsset[] };
    const localRecord = () => {
      const raw = localStorage.getItem(localRecordKey(safeKey, fileExtension, segments));
      if (!raw) return null;
      try { return JSON.parse(raw) as StoredRecord; } catch { return null; }
    };
    const result = await localDirectoryRequest<{
      found: boolean;
      reason?: "folder" | "record";
      value?: string;
      files?: FileAsset[];
      directory?: string;
    }>({
      directory: location.directory,
      operation: "load-record",
      subfolder: segments,
      key: safeKey,
      fileExtension,
      loadMode: node.config.loadMode || "latest",
    });
    if (result?.found) return {
      value: result.value || "",
      files: result.files || [],
      source: displayNodeDirectory(result.directory || location.directory, segments),
    };
    const record = localRecord();
    if (record) return { value: String(record.value ?? ""), files: record.assets || [], source: `Browser storage record “${safeKey}”` };
    const source = displayNodeDirectory(result?.directory || location.directory, segments);
    if (result?.reason === "folder") return { value: "The configured subfolder was not found.", files: [], source };
    return { value: "No saved record was found.", files: [], source };
  }

  async function loadDirectoryFiles(node: FlowNode, subfolder: string, recursive: boolean) {
    const location = resolvedDirectoryForNode(node, subfolder);
    const result = await localDirectoryRequest<{ files: FileAsset[]; directory?: string }>({
      directory: location.directory,
      operation: "list-files",
      subfolder: location.subfolder,
      recursive,
    });
    if (result) return {
      files: result.files,
      source: displayNodeDirectory(result.directory || location.directory, location.subfolder),
    };
    throw new Error(`The local directory service is unavailable for this ${node.type === "load" ? "Load" : "Load Directory"} node.`);
  }

  function mediaAssets(files: FileAsset[], kind: "image" | "video" | "audio") {
    const extensions = {
      image: /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i,
      video: /\.(avi|m4v|mkv|mov|mp4|mpeg|webm)$/i,
      audio: /\.(aac|flac|m4a|mp3|ogg|wav|webm)$/i,
    };
    return files.filter((file) => file.type.startsWith(`${kind}/`) || extensions[kind].test(file.name));
  }

  function executeScheduledGraphNode(
    node: FlowNode,
    context: WorkflowContext,
    availablePortKeys: Set<string>,
    workflow: Workflow,
  ) {
    const execute = () => executeGraphNode(node, context, availablePortKeys, workflow);
    // A Use Workflow node is an orchestration container. Its child nodes share
    // the parent's limiter, so holding a permit here could deadlock when every
    // active permit is waiting for nested work to start.
    return node.type === "workflow" ? execute() : context.executionLimiter.run(execute);
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
    const syntax = syntaxContextFor(workflow);
    const startInputs = startInputDetails(start, workflow, prompt, incomingFiles, [], syntax);
    const files = startInputs.files;
    const context: WorkflowContext = {
      userMessage: startInputs.prompt,
      files,
      values: {},
      syntax,
      chatSession: parentContext.chatSession,
      workflowStack: [...workflowStack, workflow.id],
      executionLimiter: parentContext.executionLimiter,
    };
    context.values[portValueKey(start.id, "prompt")] = startInputs.prompt;
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
      const results = await mapWithConcurrencyLimit(activeReady, () => workflowParallelismRef.current, async (node) => ({
        node,
        result: await executeScheduledGraphNode(node, context, emitted, workflow),
      }));
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
      if ((node.type === "request" || node.type === "ai-assigner") && (node.config.systemPrompt || inputFor("system_prompt", ""))) {
        debugInputs.push({ port: "system_prompt", label: "system prompt", type: "string", value: inputFor("system_prompt", node.config.systemPrompt || "") });
      }
      if (node.type === "ai-assigner") {
        (node.config.routeOptions || []).forEach((option) => {
          if (option.value?.trim()) debugInputs.push({ port: `${option.id}-activation`, label: `${option.label} activation`, type: "text", value: option.value });
          if (option.exportInstruction?.trim()) debugInputs.push({ port: `${option.id}-export`, label: `${option.label} export`, type: "text", value: option.exportInstruction });
        });
      }
      if (node.type === "input" && node.config.prompt) {
        debugInputs.push({ port: "question", label: "question", type: "prompt", value: node.config.prompt });
      }
      if ((node.type === "router-ai" || node.type === "condition-ai") && node.config.routeCriteria) {
        debugInputs.push({ port: "route-criteria", label: node.type === "condition-ai" ? "boolean condition" : "routing criteria", type: "prompt", value: node.config.routeCriteria });
      }
      if (node.type === "router-rule" && node.config.routeMethod !== "is_empty") {
        (node.config.routeOptions || [{ id: "route-1", label: "Option 1", value: node.config.routeValue || "" }]).forEach((option) => {
          debugInputs.push({ port: `${option.id}-value`, label: `${option.label} match`, type: "text", value: option.value || "" });
        });
      }
      if (node.type === "condition-rule" && node.config.routeMethod !== "is_empty") {
        debugInputs.push({ port: "expected", label: "expected value", type: "text", value: node.config.routeValue || "" });
      }
      const collectDebugOutputs = (): DebugDatum[] => nodeSchema.outputs
        .map((port) => ({ port: port.id, label: port.label, type: port.type, value: context.values[portValueKey(node.id, port.id)] }))
        .filter((datum) => datum.value !== undefined);
      let debugStatus: DebugEvent["status"] = "completed";
      let debugDetail = `Received ${String(promptInput || "").length} prompt characters and ${fileInput.length} file${fileInput.length === 1 ? "" : "s"}.`;
      let debugFileSource: string | undefined;
      const debugId = addDebugEvent(node, "running", "Processing node inputs…", { inputs: debugInputs });

      if (node.type === "string") {
        const value = node.config.stringValue || "";
        output("value", value);
        context.lastOutput = value;
        debugDetail = `Provided a ${value.length}-character string.`;
      }

      if (node.type === "chat-session") {
        const loaded = loadChatSession(node.config, context.chatSession);
        output("history", loaded.history);
        output("messages", loaded.messages);
        output("session", loaded.session);
        output("files", loaded.files);
        output("image", mediaAssets(loaded.files, "image"));
        output("video", mediaAssets(loaded.files, "video"));
        output("audio", mediaAssets(loaded.files, "audio"));
        output("document", loaded.files.filter(isDocumentAsset));
        output("title", loaded.session.title);
        output("session_id", loaded.session.id);
        output("session_number", loaded.session.number);
        output("message_count", loaded.session.previousMessageCount);
        output("updated_at", loaded.session.updatedAt);
        context.lastOutput = loaded.history || JSON.stringify(loaded.session, null, 2);
        debugDetail = `Loaded ${loaded.messages.length} previous message${loaded.messages.length === 1 ? "" : "s"} and ${loaded.files.length} attachment${loaded.files.length === 1 ? "" : "s"} from this chat session.`;
      }

      if (node.type === "load-settings") {
        const preference = node.config.settingsIncludePreference === false ? "" : userPreference.trim();
        const memories = node.config.settingsIncludeMemory === false ? [] : [...userMemoriesRef.current];
        const memoryText = formatUserMemory(memories);
        const settings = formatUserSettings(preference, memories);
        output("settings", settings);
        output("preference", preference);
        output("memory", memoryText);
        output("memories", memories);
        output("memory_count", memories.length);
        context.lastOutput = settings;
        debugDetail = `Loaded ${preference ? "the user preference and " : ""}${memories.length} memor${memories.length === 1 ? "y" : "ies"}.`;
      }

      if (node.type === "update-memory") {
        const operation = node.config.memoryOperation || "add";
        const result = applyUserMemoryOperation(userMemoriesRef.current, operation, {
          content: inputFor("content", node.config.memoryContent || ""),
          memoryId: inputFor("memory_id", node.config.memoryId || ""),
          createId: () => uid("memory"),
        });
        replaceUserMemories(result.memories);
        const memoryText = formatUserMemory(result.memories);
        output("memory", result.memory);
        output("memories", result.memories);
        output("memory_text", memoryText);
        output("count", result.memories.length);
        output("changed", result.changed);
        context.lastOutput = memoryText;
        const action = { add: "Added", update: "Updated", delete: "Deleted", clear: "Cleared" }[operation];
        debugDetail = `${action} ${operation === "clear" ? "user memory" : "a user memory"}. ${result.memories.length} memor${result.memories.length === 1 ? "y remains" : "ies remain"}.`;
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

      if (node.type === "math") {
        const mathInputs = getMathInputs(node)
          .map((input, index) => ({
            ...input,
            variable: mathInputVariable(input, index),
            value: inputFor<unknown>(input.id, undefined),
          }))
          .filter((input) => input.value !== undefined);
        const result = evaluateMathExpression(
          node.config.mathExpression || "{{input1}}",
          mathInputs,
          node.config.mathOutputType || "float",
        );
        output("result", result);
        context.lastOutput = String(result);
        debugDetail = `Calculated ${node.config.mathExpression || "{{input1}}"} from ${mathInputs.length} input${mathInputs.length === 1 ? "" : "s"}.`;
      }

      if (node.type === "media-size") {
        const asset = firstFileAsset(
          inputFor<unknown>("image", undefined),
          inputFor<unknown>("video", undefined),
          inputFor<unknown>("files", undefined),
        );
        if (!asset) throw new Error("Connect an image or video file to read its dimensions.");
        const dimensions = await getMediaDimensions(asset);
        output("width", dimensions.width);
        output("height", dimensions.height);
        context.lastOutput = `${dimensions.width} × ${dimensions.height}`;
        debugDetail = `Read ${asset.name} as ${dimensions.width} × ${dimensions.height}.`;
      }

      if (node.type === "file-name") {
        const asset = firstFileAsset(
          inputFor<unknown>("image", undefined),
          inputFor<unknown>("video", undefined),
          inputFor<unknown>("audio", undefined),
          inputFor<unknown>("document", undefined),
          inputFor<unknown>("files", undefined),
        );
        if (!asset) throw new Error("Connect a file to read its name.");
        const name = fileNameFromAsset(asset, node.config.includeExtension !== false);
        output("name", name);
        context.lastOutput = name;
        debugDetail = `Read the file name “${name}”.`;
      }

      if (node.type === "ocr") {
        if (!fileInput.length) throw new Error("Connect at least one image or PDF document to the OCR node.");
        const engine = node.config.ocrEngine || "tesseract";
        const languages = configuredOcrLanguages(node.config);
        let results: OcrResult[];
        if (engine === "tesseract") {
          if (languages === "auto") throw new Error("Choose a specific language when using Tesseract.js OCR.");
          const { performOcr } = await import("../lib/ocr-browser");
          results = await performOcr(fileInput, {
            languages,
            pdfScale: node.config.ocrPdfScale,
          }, (progress) => {
            const percent = Math.round(progress.progress * 100);
            updateDebugEvent(
              debugId,
              "running",
              `OCR ${progress.fileIndex + 1}/${progress.fileCount}: ${progress.fileName}, page ${progress.page}/${progress.pageCount} — ${progress.status} ${percent}%`,
            );
          });
        } else {
          const { prepareVisionOcrInputs } = await import("../lib/ocr-browser");
          const outputNames = ocrOutputFileNames(fileInput.map((file) => file.name));
          results = [];
          for (let fileIndex = 0; fileIndex < fileInput.length; fileIndex += 1) {
            const file = fileInput[fileIndex];
            updateDebugEvent(debugId, "running", `Preparing ${file.name} for ${engine} OCR (${fileIndex + 1}/${fileInput.length})…`);
            const prepared = await prepareVisionOcrInputs(
              file,
              node.config.ocrPdfScale || 2,
              (page, pageCount) => updateDebugEvent(debugId, "running", `Rendering ${file.name}, page ${page}/${pageCount} for ${engine} OCR…`),
            );
            const pageTexts: string[] = [];
            for (let pageIndex = 0; pageIndex < prepared.files.length; pageIndex += 1) {
              const pageFile = prepared.files[pageIndex];
              updateDebugEvent(debugId, "running", `${engine} is recognizing ${file.name}, page ${pageIndex + 1}/${prepared.pageCount} (${fileIndex + 1}/${fileInput.length})…`);
              const pageText = await requestAI({
                provider: engine,
                model: node.config.ocrModel || modelDefaults[engine],
                systemPrompt: "You are a precise OCR engine. Follow the requested transcription format exactly.",
                prompt: visionOcrPrompt(prepared.pageCount > 1 ? `${file.name}, page ${pageIndex + 1}` : file.name, languages),
                temperature: 0,
                files: [pageFile],
                openai: engine === "openai" ? { reasoningEffort: "none", maxCompletionTokens: 16384 } : undefined,
                gemini: engine === "gemini" ? { maxOutputTokens: 16384 } : undefined,
                claude: engine === "claude" ? { thinking: "disabled", maxTokens: 16384 } : undefined,
                ollama: engine === "ollama" ? { think: false, numPredict: 16384 } : undefined,
              }, providerSettings);
              pageTexts.push(pageText.trim());
            }
            const text = prepared.pageCount > 1
              ? pageTexts.map((pageText, pageIndex) => `--- Page ${pageIndex + 1} ---\n\n${pageText}`).join("\n\n")
              : pageTexts[0] || "";
            results.push({
              sourceName: file.name,
              outputName: outputNames[fileIndex],
              text,
              pageCount: prepared.pageCount,
              confidence: null,
            });
          }
        }
        const text = combineOcrResults(results);
        const exportedFiles = await Promise.all(results.map((result) => readFileAsset(
          new File([result.text], result.outputName, { type: "text/plain" }),
        )));
        output("text", text);
        output("results", results);
        output("files", exportedFiles);
        output("count", results.length);
        context.lastOutput = text;
        const pageCount = results.reduce((sum, result) => sum + result.pageCount, 0);
        debugDetail = `${engine === "tesseract" ? "Tesseract.js" : engine} OCR processed ${results.length} input${results.length === 1 ? "" : "s"} across ${pageCount} page${pageCount === 1 ? "" : "s"} and exported ${exportedFiles.length} text file${exportedFiles.length === 1 ? "" : "s"}.`;
      }

      if (node.type === "list-directory") {
        const subfolder = String(inputFor("subfolder", node.config.subfolder || ""));
        const recursive = Boolean(inputFor("recursive", node.config.includeSubfolders || false));
        const bundledDirectory = bundledLoadResult(workflow, node.id);
        const loadedDirectory = bundledDirectory ? null : await loadDirectoryFiles(node, subfolder, recursive);
        const files = bundledDirectory?.files ?? loadedDirectory!.files;
        debugFileSource = bundledDirectory ? "Bundled export snapshot" : loadedDirectory!.source;
        output("files", files);
        output("image", mediaAssets(files, "image"));
        output("video", mediaAssets(files, "video"));
        output("audio", mediaAssets(files, "audio"));
        output("names", files.map((file) => file.name));
        output("count", files.length);
        debugDetail = `Loaded ${files.length} file${files.length === 1 ? "" : "s"}.`;
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

      if (node.type === "ai-assigner") {
        const options = node.config.routeOptions?.length ? node.config.routeOptions : [{ id: "output-1", label: "Output 1" }];
        const provider = node.config.provider || "openai";
        const response = await requestAI(
          {
            provider,
            model: String(inputFor("model", node.config.model || modelDefaults[provider])),
            temperature: Number(inputFor("temperature", node.config.temperature ?? 0.2)),
            systemPrompt: buildAIWorkAssignerSystemPrompt(
              String(inputFor("system_prompt", node.config.systemPrompt || "")),
              options.map((option) => ({
                id: option.id,
                label: option.label,
                activation: option.value,
                exportInstruction: option.exportInstruction,
              })),
            ),
            prompt: [String(promptInput), ...fileAssetsPromptSections(fileInput)].filter(Boolean).join("\n\n"),
            files: fileInput,
            openai: provider === "openai" ? openAIRequestSettings(node) : undefined,
            gemini: provider === "gemini" ? geminiRequestSettings(node) : undefined,
            claude: provider === "claude" ? claudeRequestSettings(node) : undefined,
            ollama: provider === "ollama" ? ollamaRequestSettings(node) : undefined,
          },
          providerSettings,
        );
        const assignments = parseAIWorkAssignments(response, options);
        options.forEach((option) => {
          if (assignments.has(option.id)) output(option.id, assignments.get(option.id) || "");
        });
        context.lastOutput = response;
        const activated = options.filter((option) => assignments.has(option.id));
        debugStatus = "routed";
        debugDetail = activated.length
          ? `Assigned work to ${activated.map((option) => option.label).join(", ")}.`
          : "The AI response did not include any complete output sections, so no outputs were activated.";
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
        const bundledLoaded = bundledLoadResult(workflow, node.id);
        const loaded = bundledLoaded ? { ...bundledLoaded, source: "Bundled export snapshot" } : (node.config.loadMode === "folder"
          ? await (async () => {
              const loadedDirectory = await loadDirectoryFiles(
                effectiveNode,
                effectiveNode.config.subfolder || "",
                Boolean(inputFor("recursive", node.config.includeSubfolders || false)),
              );
              return { value: loadedDirectory.files.map((file) => file.name).join("\n"), ...loadedDirectory };
            })()
          : await loadRecord(effectiveNode));
        debugFileSource = loaded.source;
        context.loadedData = loaded.value;
        context.lastOutput = loaded.value;
        output("prompt", loaded.value);
        output("files", loaded.files);
        output("image", mediaAssets(loaded.files, "image"));
        output("video", mediaAssets(loaded.files, "video"));
        output("audio", mediaAssets(loaded.files, "audio"));
        output("document", loaded.files.filter(isDocumentAsset));
        debugDetail = node.config.loadMode === "folder"
          ? `Loaded all ${loaded.files.length} file${loaded.files.length === 1 ? "" : "s"}.`
          : `Loaded ${loaded.value.length} prompt characters and ${loaded.files.length} file${loaded.files.length === 1 ? "" : "s"}.`;
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

      if (node.type === "condition-rule") {
        const value = inputFor<unknown>("value", promptInput);
        const matched = evaluateBooleanRule(value, fileInput, {
          method: node.config.routeMethod,
          expected: node.config.routeValue,
          caseSensitive: node.config.caseSensitive,
        });
        output(matched ? "true" : "false", matched);
        context.lastOutput = String(matched);
        debugStatus = "routed";
        debugDetail = `Rule condition evaluated to ${matched}.`;
      }

      if (node.type === "condition-ai") {
        const value = inputFor<unknown>("value", promptInput);
        const provider = node.config.provider || "openai";
        const decision = await requestAI(
          {
            provider,
            model: node.config.model || modelDefaults[provider],
            temperature: 0,
            systemPrompt: "You are a boolean condition evaluator. Reply with only true or false. Do not explain your answer.",
            prompt: [
              `Condition:\n${node.config.routeCriteria || "Return true when the input satisfies the condition."}\n\nInput:\n${stringifyValue(value)}`,
              ...fileAssetsPromptSections(fileInput),
            ].filter(Boolean).join("\n\n"),
            files: fileInput,
            openai: provider === "openai" ? openAIRequestSettings(node) : undefined,
            gemini: provider === "gemini" ? geminiRequestSettings(node) : undefined,
            claude: provider === "claude" ? claudeRequestSettings(node) : undefined,
            ollama: provider === "ollama" ? ollamaRequestSettings(node) : undefined,
          },
          providerSettings,
        );
        const matched = parseAIBoolean(decision);
        output(matched ? "true" : "false", matched);
        context.lastOutput = String(matched);
        debugStatus = "routed";
        debugDetail = `AI condition evaluated to ${matched}.`;
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
            prompt: [
              `${node.config.routeCriteria || "Choose the best path."}\n\n${options.map((option, index) => `${index + 1}. ${option.label}`).join("\n")}\n\nInput:\n${String(promptInput)}`,
              ...fileAssetsPromptSections(fileInput),
            ].filter(Boolean).join("\n\n"),
            files: fileInput,
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
        const owner = plugins.find((plugin) => plugin.nodes.some((candidate) => candidate.type === node.type));
        const definition = owner?.nodes.find((candidate) => candidate.type === node.type);
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
          owner?.files || [],
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
      updateDebugEvent(debugId, debugStatus, debugDetail, { outputs: collectDebugOutputs(), fileSource: debugFileSource });
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
      const results = await mapWithConcurrencyLimit(executable, () => workflowParallelismRef.current, async (node) => ({
        node,
        result: await executeScheduledGraphNode(node, context, emitted, activeWorkflow),
      }));
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

  async function runNewWorkflowMessage(text: string, messageFiles: FileAsset[], priorMessages = messages) {
    setDebugEvents([]);
    const start = activeWorkflow.nodes.find((node) => node.type === "start");
    if (!start) throw new Error("This workflow needs a Start node.");
    const syntax = syntaxContextFor();
    const startInputs = startInputDetails(start, activeWorkflow, text, messageFiles, priorMessages, syntax);
    const files = startInputs.files;
    const context: WorkflowContext = {
      userMessage: startInputs.prompt,
      files,
      values: {},
      syntax,
      chatSession: {
        id: activeChatSession.id,
        number: activeChatSession.sessionNumber,
        title: activeChatSession.title,
        updatedAt: activeChatSession.updatedAt,
        messages: structuredClone(priorMessages),
      },
      workflowStack: [activeWorkflow.id],
      executionLimiter: createWorkflowTaskLimiter(() => workflowParallelismRef.current),
    };
    context.values[portValueKey(start.id, "prompt")] = startInputs.prompt;
    context.values[portValueKey(start.id, "files")] = files;
    context.values[portValueKey(start.id, "image")] = mediaAssets(files, "image");
    context.values[portValueKey(start.id, "video")] = mediaAssets(files, "video");
    context.values[portValueKey(start.id, "audio")] = mediaAssets(files, "audio");
    context.values[portValueKey(start.id, "document")] = files.filter(isDocumentAsset);
    addDebugEvent(
      start,
      "completed",
      `Included ${startInputs.includedHistoryCount} prior message${startInputs.includedHistoryCount === 1 ? "" : "s"}, ${startInputs.prompt.length} prompt characters, and ${files.length} file${files.length === 1 ? "" : "s"}.`,
      { outputs: [
        { port: "prompt", label: "prompt", type: "prompt", value: startInputs.prompt },
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
      const messageIndex = messages.findIndex((candidate) => candidate.id === message.id);
      await runNewWorkflowMessage(message.text, files, messageIndex < 0 ? messages : messages.slice(0, messageIndex));
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
              <button onClick={() => fileInputRef.current?.click()}><Upload size={15} /> Import</button>
              <button onClick={exportWorkflow}><Download size={15} /> Export JSON</button>
              <button className="export-with-files" onClick={exportWorkflowWithFiles}><Download size={15} /> Export with files</button>
              <input ref={fileInputRef} type="file" accept="application/json,application/zip,.json,.zip" hidden onChange={importWorkflow} />
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
                <button className="secondary-button" onClick={saveWorkflow}><Save size={15} /> Save</button>
                <button className="primary-button" onClick={openWorkflowChat}><Play size={15} fill="currentColor" /> Test workflow</button>
                <button className="icon-button hide-mobile" aria-label="More options"><MoreHorizontal size={18} /></button>
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
              onContextMenu={openWorkflowCanvasContextMenu}
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
                          <small>{node.type === "request" || node.type === "ai-assigner" || node.type === "router-ai" || node.type === "condition-ai" ? `${node.config.provider || "openai"} · ${node.config.model || "model"}` : node.type === "workflow" ? workflows.find((workflow) => workflow.id === node.config.calledWorkflowId)?.name || "Select a workflow" : meta.subtitle}</small>
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
                      {(node.type === "ai-assigner" || node.type === "router-ai" || node.type === "router-rule") && <button className="route-add-button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); addRouteOption(node.id); }}><Plus size={11} /> Add new {node.type === "ai-assigner" ? "output" : "route"}</button>}
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
                  {selectedNode.type === "math" && <>
                    <label className="field-label">Output type<div className="select-wrap"><select value={selectedNode.config.mathOutputType || "float"} onChange={(event) => updateNode({ config: { mathOutputType: event.target.value as MathOutputType } })}><option value="string">String</option><option value="float">Float</option><option value="integer">Integer</option></select><ChevronDown size={14} /></div></label>
                    <div className="join-inputs-editor">
                      <span className="field-title-row"><b>Input variables</b><small>New inputs appear when the last port is linked.</small></span>
                      {getMathInputs(selectedNode).map((input, index, inputs) => <label key={input.id}><span>{index + 1}</span><input aria-label={`Math input ${index + 1} variable`} value={input.variable} placeholder={`input${index + 1}`} onChange={(event) => { const variable = event.target.value.replace(/[^a-z0-9_]/gi, "").replace(/^[^a-z_]+/i, ""); updateNode({ config: { mathInputs: inputs.map((item) => item.id === input.id ? { ...item, variable } : item) } }); }} /><code>{`{{${mathInputVariable(input, index)}}}`}</code></label>)}
                    </div>
                    <label className="field-label">Expression<textarea rows={4} className="code-editor" spellCheck={false} value={selectedNode.config.mathExpression || ""} placeholder="{{input1}} + {{input2}}" onChange={(event) => updateNode({ config: { mathExpression: event.target.value } })} /><small className="field-help">Operators: +, −, × (*), ÷ (/), %, ^, **. Functions: abs, ceil, floor, max, min, pow, round, sign, sqrt. Constants: PI, E.</small></label>
                  </>}
                  {selectedNode.type === "file-name" && <label className="check-field"><input type="checkbox" checked={selectedNode.config.includeExtension !== false} onChange={(event) => updateNode({ config: { includeExtension: event.target.checked } })} /><span>Include file extension</span></label>}
                  {selectedNode.type === "ocr" && (() => {
                    const engine = selectedNode.config.ocrEngine || "tesseract";
                    const legacyLanguages = (selectedNode.config.ocrLanguages || "eng").split(/[+,\s]+/).filter(Boolean);
                    const primaryLanguage = selectedNode.config.ocrPrimaryLanguage || legacyLanguages[0] || "eng";
                    const additionalLanguages = selectedNode.config.ocrAdditionalLanguages ?? legacyLanguages.slice(1).join("+");
                    const knownPrimary = OCR_LANGUAGE_OPTIONS.some((language) => language.code === primaryLanguage);
                    const provider = engine === "tesseract" ? null : engine;
                    return <>
                      <label className="field-label">OCR engine<div className="select-wrap"><select value={engine} onChange={(event) => {
                        const nextEngine = event.target.value as OcrEngine;
                        updateNode({ config: {
                          ocrEngine: nextEngine,
                          ocrPrimaryLanguage: nextEngine === "tesseract" && primaryLanguage === "auto" ? "eng" : primaryLanguage,
                          ocrModel: nextEngine === "tesseract" ? selectedNode.config.ocrModel : modelDefaults[nextEngine],
                        } });
                      }}><option value="tesseract">Tesseract.js — on device</option><option value="openai">OpenAI vision</option><option value="gemini">Google Gemini vision</option><option value="claude">Anthropic Claude vision</option><option value="ollama">Ollama vision — local model</option></select><ChevronDown size={14} /></div><small className="field-help">Tesseract processes files in the browser. Cloud AI engines send each page to the selected provider; Ollama stays on your local server.</small></label>
                      {provider && <label className="field-label"><span className="field-title-row">Vision model <button type="button" onClick={() => refreshAvailableModels(provider)} disabled={modelsLoading[provider]}><RefreshCw size={12} className={modelsLoading[provider] ? "spin" : ""} /> Refresh available</button></span><input list="available-ocr-models" value={selectedNode.config.ocrModel || modelDefaults[provider]} onChange={(event) => updateNode({ config: { ocrModel: event.target.value } })} /><datalist id="available-ocr-models">{(availableModels[provider] || []).map((model) => <option key={model} value={model} />)}</datalist><small className="field-help">Choose a model that accepts image input.</small></label>}
                      <label className="field-label">Primary language<div className="select-wrap"><select value={primaryLanguage} onChange={(event) => updateNode({ config: { ocrPrimaryLanguage: event.target.value } })}>{engine !== "tesseract" && <option value="auto">Auto detect</option>}{!knownPrimary && primaryLanguage !== "auto" && <option value={primaryLanguage}>Custom ({primaryLanguage})</option>}{OCR_LANGUAGE_OPTIONS.map((language) => <option key={language.code} value={language.code}>{language.label}</option>)}</select><ChevronDown size={14} /></div></label>
                      <label className="field-label">Additional languages<input value={additionalLanguages} disabled={primaryLanguage === "auto"} placeholder="Optional, e.g. eng+kor" onChange={(event) => updateNode({ config: { ocrAdditionalLanguages: event.target.value } })} /><small className="field-help">Optional Tesseract codes separated by +, commas, or spaces. Leave empty for one language.</small></label>
                      <label className="field-label">PDF render quality<div className="select-wrap"><select value={selectedNode.config.ocrPdfScale || 2} onChange={(event) => updateNode({ config: { ocrPdfScale: Number(event.target.value) } })}><option value="1">Standard (1×)</option><option value="2">High (2×)</option><option value="3">Very high (3×)</option><option value="4">Maximum (4×)</option></select><ChevronDown size={14} /></div><small className="field-help">Higher quality can improve scanned PDFs but uses more memory and takes longer.</small></label>
                    </>;
                  })()}
                  {selectedNode.type === "chat-session" && (
                    <>
                      <div className="start-input-intro"><History size={14} /><span><b>Previous session context</b><small>Loads messages that existed before the current workflow run.</small></span></div>
                      <details className="start-input-group" open>
                        <summary><MessageSquare size={14} /><span><b>Messages</b><small>Select roles and the amount of recent history</small></span><ChevronDown size={14} /></summary>
                        <div className="start-input-fields">
                          <label className="check-field"><input type="checkbox" checked={selectedNode.config.sessionIncludeUserMessages !== false} onChange={(event) => updateNode({ config: { sessionIncludeUserMessages: event.target.checked } })} /><span>User messages</span></label>
                          <label className="check-field"><input type="checkbox" checked={selectedNode.config.sessionIncludeAssistantMessages !== false} onChange={(event) => updateNode({ config: { sessionIncludeAssistantMessages: event.target.checked } })} /><span>Assistant messages</span></label>
                          <label className="check-field"><input type="checkbox" checked={selectedNode.config.sessionIncludeSystemMessages === true} onChange={(event) => updateNode({ config: { sessionIncludeSystemMessages: event.target.checked } })} /><span>System messages</span></label>
                          <label className="field-label compact-field">Maximum previous messages<input type="number" min="1" max="100" value={selectedNode.config.sessionHistoryLimit ?? 20} onChange={(event) => updateNode({ config: { sessionHistoryLimit: Math.max(1, Math.min(100, Number(event.target.value) || 1)) } })} /><small className="field-help">The newest matching messages are exposed through the history and messages outputs.</small></label>
                          <label className="check-field"><input type="checkbox" checked={selectedNode.config.sessionIncludeMessageTimes === true} onChange={(event) => updateNode({ config: { sessionIncludeMessageTimes: event.target.checked } })} /><span>Include times in formatted history</span></label>
                          <label className="check-field"><input type="checkbox" checked={selectedNode.config.sessionIncludeAttachments !== false} onChange={(event) => updateNode({ config: { sessionIncludeAttachments: event.target.checked } })} /><span>Expose attachments from selected messages</span></label>
                        </div>
                      </details>
                      <div className="local-first-note"><Info size={14} /><div><strong>Session metadata is always available</strong><span>Use the session, title, session ID, session number, message count, and updated-at outputs independently of message filters.</span></div></div>
                    </>
                  )}
                  {selectedNode.type === "load-settings" && (
                    <>
                      <div className="start-input-intro"><Settings size={14} /><span><b>Personalization data</b><small>Choose which local user settings this node exposes.</small></span></div>
                      <label className="check-field"><input type="checkbox" checked={selectedNode.config.settingsIncludePreference !== false} onChange={(event) => updateNode({ config: { settingsIncludePreference: event.target.checked } })} /><span>User preference</span></label>
                      <label className="check-field"><input type="checkbox" checked={selectedNode.config.settingsIncludeMemory !== false} onChange={(event) => updateNode({ config: { settingsIncludeMemory: event.target.checked } })} /><span>User memory</span></label>
                      <div className="local-first-note"><Info size={14} /><div><strong>Connect settings to a model prompt</strong><span>The settings output combines both sections. Separate text and structured outputs are also available.</span></div></div>
                    </>
                  )}
                  {selectedNode.type === "update-memory" && (
                    <>
                      <label className="field-label">Operation<div className="select-wrap"><select value={selectedNode.config.memoryOperation || "add"} onChange={(event) => updateNode({ config: { memoryOperation: event.target.value as MemoryOperation } })}><option value="add">Add memory</option><option value="update">Update memory</option><option value="delete">Delete memory</option><option value="clear">Clear all memory</option></select><ChevronDown size={14} /></div></label>
                      {(selectedNode.config.memoryOperation || "add") !== "clear" && (selectedNode.config.memoryOperation || "add") !== "delete" && <label className="field-label">Fallback memory content<textarea rows={4} value={selectedNode.config.memoryContent || ""} placeholder="What should Magic Conch remember?" onChange={(event) => updateNode({ config: { memoryContent: event.target.value } })} /><small className="field-help">Used when the memory content port is not connected.</small></label>}
                      {(["update", "delete"] as MemoryOperation[]).includes(selectedNode.config.memoryOperation || "add") && <label className="field-label">Fallback memory ID<input value={selectedNode.config.memoryId || ""} placeholder="memory-…" onChange={(event) => updateNode({ config: { memoryId: event.target.value } })} /><small className="field-help">Use an ID from the Load User Settings memories output.</small></label>}
                      <div className="local-first-note"><Info size={14} /><div><strong>Updates persist immediately</strong><span>Memory changes are stored on this device and are available to later nodes and workflow runs.</span></div></div>
                    </>
                  )}
                  {selectedNode.type === "start" && (
                    <>
                      <label className="field-label">Agent name<input value={selectedNode.config.agentName || ""} placeholder={DEFAULT_AGENT_NAME} onChange={(event) => updateNode({ config: { agentName: event.target.value } })} /><small className="field-help">Shown beside every message sent by this workflow.</small></label>
                      <label className="field-label">Start message<textarea rows={4} value={selectedNode.config.startMessage || ""} placeholder={DEFAULT_START_MESSAGE} onChange={(event) => updateNode({ config: { startMessage: event.target.value } })} /><small className="field-help">Shown when a new chat starts or this workflow is opened for testing.</small></label>
                      <div className="start-input-intro"><Info size={14} /><span><b>Start output composition</b><small>Choose exactly what the prompt and file outputs receive when a run begins.</small></span></div>
                      <details className="start-input-group" open>
                        <summary><MessageSquare size={14} /><span><b>Messages</b><small>Current message and optional chat history</small></span><ChevronDown size={14} /></summary>
                        <div className="start-input-fields">
                          <label className="check-field"><input type="checkbox" checked={selectedNode.config.startIncludeCurrentMessage !== false} onChange={(event) => updateNode({ config: { startIncludeCurrentMessage: event.target.checked } })} /><span>Current user message</span></label>
                          <label className="check-field"><input type="checkbox" checked={selectedNode.config.startIncludePriorUserMessages === true} onChange={(event) => updateNode({ config: { startIncludePriorUserMessages: event.target.checked } })} /><span>Previous user messages</span></label>
                          <label className="check-field"><input type="checkbox" checked={selectedNode.config.startIncludeAssistantMessages === true} onChange={(event) => updateNode({ config: { startIncludeAssistantMessages: event.target.checked } })} /><span>Assistant messages</span></label>
                          <label className="check-field"><input type="checkbox" checked={selectedNode.config.startIncludeSystemMessages === true} onChange={(event) => updateNode({ config: { startIncludeSystemMessages: event.target.checked } })} /><span>System messages</span></label>
                          <label className="field-label compact-field">Maximum previous messages<input type="number" min="1" max="100" value={selectedNode.config.startHistoryLimit ?? 20} onChange={(event) => updateNode({ config: { startHistoryLimit: Math.max(1, Math.min(100, Number(event.target.value) || 1)) } })} /><small className="field-help">Applied after filtering by the roles above; the newest messages are kept.</small></label>
                          <label className="check-field"><input type="checkbox" checked={selectedNode.config.startIncludeMessageTimes === true} onChange={(event) => updateNode({ config: { startIncludeMessageTimes: event.target.checked } })} /><span>Include displayed message times</span></label>
                        </div>
                      </details>
                      <details className="start-input-group" open>
                        <summary><Paperclip size={14} /><span><b>Files</b><small>Attachments exposed on file and media ports</small></span><ChevronDown size={14} /></summary>
                        <div className="start-input-fields">
                          <label className="check-field"><input type="checkbox" checked={selectedNode.config.startIncludeCurrentFiles !== false} onChange={(event) => updateNode({ config: { startIncludeCurrentFiles: event.target.checked } })} /><span>Current message attachments</span></label>
                          <label className="check-field"><input type="checkbox" checked={selectedNode.config.startIncludePriorFiles === true} onChange={(event) => updateNode({ config: { startIncludePriorFiles: event.target.checked } })} /><span>Attachments from earlier messages</span></label>
                        </div>
                      </details>
                      <details className="start-input-group">
                        <summary><Settings size={14} /><span><b>Other context</b><small>Session, workflow, run, and Start settings</small></span><ChevronDown size={14} /></summary>
                        <div className="start-input-fields">
                          <label className="check-field"><input type="checkbox" checked={selectedNode.config.startIncludeSessionInfo === true} onChange={(event) => updateNode({ config: { startIncludeSessionInfo: event.target.checked } })} /><span>Chat title, number, and session ID</span></label>
                          <label className="check-field"><input type="checkbox" checked={selectedNode.config.startIncludeWorkflowInfo === true} onChange={(event) => updateNode({ config: { startIncludeWorkflowInfo: event.target.checked } })} /><span>Workflow name and description</span></label>
                          <label className="check-field"><input type="checkbox" checked={selectedNode.config.startIncludeStartSettings === true} onChange={(event) => updateNode({ config: { startIncludeStartSettings: event.target.checked } })} /><span>Agent name and opening message</span></label>
                          <label className="check-field"><input type="checkbox" checked={selectedNode.config.startIncludeRunDateTime === true} onChange={(event) => updateNode({ config: { startIncludeRunDateTime: event.target.checked } })} /><span>Run date and time</span></label>
                          <label className="field-label compact-field">Additional context<textarea rows={4} value={selectedNode.config.startAdditionalContext || ""} placeholder="Instructions or context added to every run…" onChange={(event) => updateNode({ config: { startAdditionalContext: event.target.value } })} /><small className="field-help">Workflow syntax such as {`{{chat-session-title}}`} and {`{{date}}`} is supported. Provider keys and private connection settings are never included.</small></label>
                        </div>
                      </details>
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
                  {(selectedNode.type === "request" || selectedNode.type === "ai-assigner" || selectedNode.type === "router-ai" || selectedNode.type === "condition-ai") && (
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
                      {selectedNode.type === "request" || selectedNode.type === "ai-assigner" ? <>
                        <label className="field-label">System prompt<textarea rows={selectedNode.type === "ai-assigner" ? 10 : 5} value={selectedNode.config.systemPrompt || ""} placeholder={selectedNode.type === "ai-assigner" ? "Describe in detail how to decide which workers are needed, their roles, constraints, priorities, and what each prompt should contain…" : "Describe how the model should behave…"} onChange={(event) => updateNode({ config: { systemPrompt: event.target.value } })} /></label>
                        {selectedNode.type === "request" && <label className="field-label">Create file from response<input value={selectedNode.config.outputFileName || ""} placeholder="Optional, e.g. report.md" onChange={(event) => updateNode({ config: { outputFileName: event.target.value } })} /><small className="field-help">When set, the response becomes a workflow file that Save nodes can write.</small></label>}
                        {selectedNode.type === "ai-assigner" && <small className="field-help">The named section format is added automatically. Each activated output exports its enclosed text as a prompt; connect it directly to an AI Request node&apos;s prompt input.</small>}
                      </> : <>
                        <label className="field-label">{selectedNode.type === "condition-ai" ? "Boolean condition" : "Routing criteria"}<textarea rows={4} value={selectedNode.config.routeCriteria || ""} placeholder={selectedNode.type === "condition-ai" ? "For example: The request is about billing." : "Describe when to choose path A or B…"} onChange={(event) => updateNode({ config: { routeCriteria: event.target.value } })} /></label>
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
                  {(selectedNode.type === "router-rule" || selectedNode.type === "condition-rule") && (
                    <>
                      <label className="field-label">Rule method<div className="select-wrap"><select value={selectedNode.config.routeMethod || "contains"} onChange={(event) => updateNode({ config: { routeMethod: event.target.value as FlowNode["config"]["routeMethod"] } })}><option value="contains">Contains text</option><option value="not_contains">Does not contain text</option><option value="equals">Equals text</option><option value="starts_with">Starts with</option><option value="ends_with">Ends with</option><option value="regex">Regular expression</option><option value="length_gt">Text length greater than</option><option value="length_lt">Text length less than</option><option value="is_empty">Is empty</option><option value="file_type">Has file type</option><option value="file_count_gt">File count greater than</option><option value="number_gt">Number greater than</option><option value="number_lt">Number less than</option></select><ChevronDown size={14} /></div></label>
                      {selectedNode.type === "condition-rule" && selectedNode.config.routeMethod !== "is_empty" && <label className="field-label">Expected value<input value={selectedNode.config.routeValue || ""} placeholder="Value to compare against" onChange={(event) => updateNode({ config: { routeValue: event.target.value } })} /></label>}
                      <label className="check-field"><input type="checkbox" checked={selectedNode.config.caseSensitive || false} onChange={(event) => updateNode({ config: { caseSensitive: event.target.checked } })} /><span>Case-sensitive text matching</span></label>
                    </>
                  )}
                  {(selectedNode.type === "condition-ai" || selectedNode.type === "condition-rule") && <div className="inspector-note"><GitBranch size={14} /><span><b>if / elif / else</b><small>Use true as the if branch. Connect false to the gate of another condition for elif, or use the final false output as else.</small></span></div>}
                  {(selectedNode.type === "ai-assigner" || selectedNode.type === "router-ai" || selectedNode.type === "router-rule") && (
                    <div className="route-options-editor">
                      <span className="field-title-row">
                        <b>{selectedNode.type === "ai-assigner" ? "Assignment outputs" : "Route outputs"}</b>
                        <button type="button" onClick={() => addRouteOption(selectedNode.id)}><Plus size={12} /> Add {selectedNode.type === "ai-assigner" ? "output" : "option"}</button>
                      </span>
                      {(selectedNode.config.routeOptions || [{ id: selectedNode.type === "ai-assigner" ? "output-1" : "route-1", label: selectedNode.type === "ai-assigner" ? "Output 1" : "Option 1", value: selectedNode.config.routeValue || "" }]).map((option, index, options) => (
                        <div className="route-option-row" key={option.id}>
                          <span>{index + 1}</span>
                          <div>
                            {selectedNode.type === "ai-assigner" && <small className="route-option-field-label">Output name</small>}
                            <input aria-label={`${selectedNode.type === "ai-assigner" ? "Output" : "Option"} ${index + 1} label`} value={option.label} onChange={(event) => updateNode({ config: { routeOptions: options.map((item) => item.id === option.id ? { ...item, label: event.target.value } : item) } })} />
                            {selectedNode.type === "ai-assigner" && <small className="route-option-field-label">When to activate</small>}
                            {selectedNode.type === "ai-assigner" && <textarea aria-label={`${option.label} activation description`} className="route-activation-input" rows={3} value={option.value || ""} placeholder="Activate when…" onChange={(event) => updateNode({ config: { routeOptions: options.map((item) => item.id === option.id ? { ...item, value: event.target.value } : item) } })} />}
                            {selectedNode.type === "ai-assigner" && <small className="route-option-field-label">What to export</small>}
                            {selectedNode.type === "ai-assigner" && <textarea aria-label={`${option.label} export instruction`} className="route-export-input" rows={3} value={option.exportInstruction || ""} placeholder="Describe the standalone prompt this output should receive…" onChange={(event) => updateNode({ config: { routeOptions: options.map((item) => item.id === option.id ? { ...item, exportInstruction: event.target.value } : item) } })} />}
                            {selectedNode.type === "router-rule" && selectedNode.config.routeMethod !== "is_empty" && <input aria-label={`${option.label} match value`} className="route-value-input" value={option.value || ""} placeholder="Match value" onChange={(event) => updateNode({ config: { routeOptions: options.map((item) => item.id === option.id ? { ...item, value: event.target.value } : item) } })} />}
                          </div>
                          <button className="mini-icon route-option-delete" disabled={options.length <= 1} aria-label={options.length <= 1 ? "At least one output is required" : `Remove ${option.label}`} title={options.length <= 1 ? "At least one output is required" : "Delete output"} onClick={() => removeRouteOption(selectedNode.id, option.id)}><Trash2 size={13} /></button>
                        </div>
                      ))}
                      <small>{selectedNode.type === "ai-assigner" ? "Set when each output activates and what standalone prompt it should export. Multiple outputs can activate together; omitted outputs stay inactive." : "Connecting the last output automatically creates the next one."}</small>
                    </div>
                  )}
                  {selectedNode.type === "list-directory" && (
                    <>
                      <label className="field-label">Subfolder path<input value={selectedNode.config.subfolder || ""} placeholder="Optional relative subfolder" onChange={(event) => updateNode({ config: { subfolder: event.target.value } })} /><small className="field-help">May also be supplied through the string attribute port.</small></label>
                      <label className="check-field"><input type="checkbox" checked={selectedNode.config.includeSubfolders || false} onChange={(event) => updateNode({ config: { includeSubfolders: event.target.checked } })} /><span>Include files in subfolders</span></label>
                      <label className="field-label">Directory path<input value={selectedNode.config.directoryPath ?? selectedNode.config.directoryName ?? ""} placeholder={`${configuredDefaultDirectory()} (default)`} onChange={(event) => updateNode({ config: { directoryPath: event.target.value, directoryName: undefined } })} /><small className="field-help">Relative paths start at the Magic Conch program folder. Absolute paths are supported. No browser permission is required.</small></label>
                    </>
                  )}
                  {(selectedNode.type === "save" || selectedNode.type === "load") && (
                    <>
                      {(selectedNode.type === "save" || selectedNode.config.loadMode !== "folder") && <label className="field-label">File key<input value={selectedNode.config.key || ""} placeholder="record-name" onChange={(event) => updateNode({ config: { key: event.target.value } })} /><small className="field-help">Versioned files with the same key can coexist.</small></label>}
                      {(selectedNode.type === "save" || selectedNode.config.loadMode !== "folder") && <label className="field-label">File extension<input value={selectedNode.config.fileExtension || "json"} placeholder="json" onChange={(event) => updateNode({ config: { fileExtension: event.target.value } })} /><small className="field-help">Enter an extension with or without a leading dot. Saved record content remains JSON.</small></label>}
                      <label className="field-label">Subfolder path<input value={selectedNode.config.subfolder || ""} placeholder="Optional, relative to the directory below" onChange={(event) => updateNode({ config: { subfolder: event.target.value } })} /><small className="field-help">Leave blank to use the directory itself.</small></label>
                      <label className="field-label">Directory path<input value={selectedNode.config.directoryPath ?? selectedNode.config.directoryName ?? ""} placeholder={`${configuredDefaultDirectory()} (default)`} onChange={(event) => updateNode({ config: { directoryPath: event.target.value, directoryName: undefined } })} /><small className="field-help">Relative paths start at the Magic Conch program folder. Absolute paths are supported. No browser permission is required.</small></label>
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
                <div><strong>Local database</strong><small>{configuredDefaultDirectory()}</small></div>
                <span className="status-dot connected" />
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
            <div className="debug-summary"><span className={isRunning ? "live" : ""}><i /> {isRunning ? "Running" : "Idle"}</span><small>{debugEvents.length} step{debugEvents.length === 1 ? "" : "s"}</small><div className="debug-summary-actions"><button onClick={exportDebugLog} disabled={!debugEvents.length} aria-label="Export debug log" title="Download this chat's debug log"><Download size={10} /> Export log</button><button onClick={() => setDebugEvents([])} disabled={isRunning}>Clear</button></div></div>
            <div className="debug-events">
              {debugEvents.length ? debugEvents.map((event, index) => <article className={`debug-event ${event.status}`} key={event.id}><span className="debug-rail">{index < debugEvents.length - 1 && <i />}</span><span className="debug-status-icon">{event.status === "running" ? <LoaderCircle size={14} className="spin" /> : event.status === "waiting" ? <MessageCircleQuestion size={14} /> : event.status === "routed" ? <Route size={14} /> : event.status === "error" ? <X size={14} /> : <Check size={14} />}</span><div><span><strong>{event.nodeName}</strong><small>{event.time}</small></span><b>{event.nodeType} · {event.status}</b><p>{event.detail}</p>{event.fileSource && <div className="debug-file-source"><FolderOpen size={12} /><span><small>Files loaded from</small><code title={event.fileSource}>{event.fileSource}</code></span></div>}{event.modelThinking && <details className="debug-thinking"><summary><BrainCircuit size={11} /> Model thinking</summary><pre>{event.modelThinking}</pre></details>}<DebugDataSection title="Inputs used" items={event.inputs} /><DebugDataSection title="Outputs produced" items={event.outputs} /></div></article>) : <div className="debug-empty"><Bug size={25} /><strong>No run recorded</strong><p>Send a message to see each workflow node execute here.</p></div>}
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
              <button className={settingsTab === "personalization" ? "active" : ""} onClick={() => setSettingsTab("personalization")}><BrainCircuit size={14} /> Personalization</button>
              <button className={settingsTab === "api" ? "active" : ""} onClick={() => setSettingsTab("api")}><KeyRound size={14} /> API</button>
              <button className={settingsTab === "plugins" ? "active" : ""} onClick={() => setSettingsTab("plugins")}><Plug size={14} /> Plug-ins</button>
            </nav>
            <div className="settings-scroll">
              {settingsTab === "personalization" && (
                <>
                  <div className="settings-section tab-section">
                    <div className="section-title"><Settings size={17} /><div><strong>User preference</strong><small>Describe how workflows and assistants should respond to you.</small></div></div>
                    <label className="field-label">Your preference<textarea rows={7} value={userPreference} placeholder="For example: Use concise answers, explain technical terms plainly, and use Korean unless I ask otherwise." onChange={(event) => setUserPreference(event.target.value)} /><small className="field-help">This is only included in a workflow when you connect a Load User Settings node.</small></label>
                  </div>
                  <div className="settings-section">
                    <div className="section-title"><BrainCircuit size={17} /><div><strong>User memory</strong><small>Facts and context you want Magic Conch to remember across chats and workflows.</small></div></div>
                    <div className="memory-composer">
                      <textarea rows={3} value={newMemoryContent} placeholder="Add something to remember…" onChange={(event) => setNewMemoryContent(event.target.value)} />
                      <button className="primary-button" disabled={!newMemoryContent.trim()} onClick={() => {
                        const result = applyUserMemoryOperation(userMemoriesRef.current, "add", { content: newMemoryContent, createId: () => uid("memory") });
                        replaceUserMemories(result.memories);
                        setNewMemoryContent("");
                      }}><Plus size={14} /> Add memory</button>
                    </div>
                    <div className="user-memory-list">
                      {userMemories.length ? userMemories.map((memory) => (
                        <div className="user-memory-item" key={memory.id}>
                          <textarea rows={2} aria-label={`Memory ${memory.id}`} value={memory.content} onChange={(event) => replaceUserMemories((current) => current.map((item) => item.id === memory.id ? { ...item, content: event.target.value, updatedAt: new Date().toISOString() } : item))} />
                          <button className="mini-icon" aria-label="Delete memory" title="Delete memory" onClick={() => replaceUserMemories((current) => current.filter((item) => item.id !== memory.id))}><Trash2 size={14} /></button>
                        </div>
                      )) : <div className="no-memories"><BrainCircuit size={22} /><span>No saved memories yet</span><small>Add facts, goals, preferences, or recurring context.</small></div>}
                    </div>
                    {!!userMemories.length && <button className="danger-button clear-memory-button" onClick={() => replaceUserMemories([])}><Trash2 size={14} /> Clear all memory</button>}
                  </div>
                  <div className="local-first-note"><HardDrive size={17} /><div><strong>Private and local</strong><span>Preference and memory stay in this browser unless a workflow sends them to an AI provider.</span></div></div>
                </>
              )}
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
                    <div className="section-title"><WorkflowIcon size={17} /><div><strong>Workflow execution</strong><small>Control how quickly parallel branches and calls are started.</small></div></div>
                    <label className="check-field automatic-parallelism"><input type="checkbox" checked={automaticWorkflowParallelism} onChange={(event) => setAutomaticWorkflowParallelism(event.target.checked)} /><span>Set limit automatically</span></label>
                    {automaticWorkflowParallelism ? (
                      <div className={`pressure-status pressure-${systemPressureLevel}`}><span>System pressure: <strong>{systemPressureLevel}</strong></span><span>Current limit: <strong>{automaticParallelism} node{automaticParallelism === 1 ? "" : "s"}</strong></span><small>Rechecked every 2 seconds using available CPU, memory, and responsiveness signals.</small></div>
                    ) : (
                      <label className="field-label history-limit">Maximum parallel nodes<input type="number" min={MIN_WORKFLOW_PARALLELISM} max={MAX_WORKFLOW_PARALLELISM} value={workflowParallelism} onChange={(event) => setWorkflowParallelism(normalizeWorkflowParallelism(event.target.value))} /><small className="field-help">Between {MIN_WORKFLOW_PARALLELISM} and {MAX_WORKFLOW_PARALLELISM}. Use 1 for sequential execution; lower values reduce memory use and API request bursts.</small></label>
                    )}
                  </div>
                  <div className="settings-section">
                    <div className="section-title"><Undo2 size={17} /><div><strong>Workflow history</strong><small>Choose how many workflow changes are available to undo.</small></div></div>
                    <label className="field-label history-limit">Undo records<input type="number" min="1" max="500" value={undoLimit} onChange={(event) => setUndoLimit(Math.max(1, Math.min(500, Number(event.target.value) || 1)))} /><small className="field-help">Between 1 and 500 records per workflow.</small></label>
                  </div>
                  <div className="settings-section">
                    <div className="section-title"><FolderOpen size={17} /><div><strong>Default folders</strong><small>Save and Load nodes use this persistent path unless the node provides its own path.</small></div></div>
                    <label className="field-label default-directory-field">Default Save/Load directory<input value={defaultDirectoryPath} placeholder={DEFAULT_LOCAL_DIRECTORY} onChange={(event) => setDefaultDirectoryPath(event.target.value)} onBlur={() => { if (!defaultDirectoryPath.trim()) setDefaultDirectoryPath(DEFAULT_LOCAL_DIRECTORY); }} /><small className="field-help">Relative paths start at the Magic Conch program folder. Absolute paths are also supported by the local app.</small></label>
                    <div className="folder-row"><span className="folder-icon"><FileJson size={18} /></span><div><strong>Workflow folder</strong><small>{workflowFolder ? workflowFolder.name : "Not connected — use Export to download files"}</small></div><button className="secondary-button" onClick={chooseWorkflowFolder}><FolderOpen size={14} /> Choose</button></div>
                  </div>
                  <div className="local-first-note"><HardDrive size={17} /><div><strong>Local-first by design</strong><span>Your workflows, keys, and saved records stay on this device unless you call an AI provider.</span></div></div>
                </>
              )}
              {settingsTab === "plugins" && (
                <div className="settings-section tab-section">
                  <div className="section-title"><Plug size={17} /><div><strong>Custom node plug-ins</strong><small>Install a JSON manifest or ZIP bundle to add nodes, code, and supporting files.</small></div></div>
                  <div className="plugin-warning"><Info size={16} /><span>Plug-ins can run code with access to this app. Install only files you trust.</span></div>
                  <button className="primary-button install-plugin" onClick={() => pluginInputRef.current?.click()}><Upload size={14} /> Install plug-in</button>
                  <input ref={pluginInputRef} type="file" accept="application/json,application/zip,.json,.zip" hidden onChange={importPlugin} />
                  <div className="installed-plugins">
                    {plugins.length ? plugins.map((plugin) => <div key={plugin.id}><span className="folder-icon"><Plug size={16} /></span><span><strong>{plugin.name}</strong><small>v{plugin.version} · {plugin.nodes.length} node{plugin.nodes.length === 1 ? "" : "s"}{plugin.files?.length ? ` · ${plugin.files.length} file${plugin.files.length === 1 ? "" : "s"}` : ""}</small></span><button className="mini-icon" aria-label={`Remove ${plugin.name}`} onClick={() => setPlugins((current) => current.filter((item) => item.id !== plugin.id))}><Trash2 size={14} /></button></div>) : <div className="no-plugins"><Plug size={22} /><span>No plug-ins installed yet</span><small>An example is included in examples/text-tools.plugin.json.</small></div>}
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer"><button className="primary-button" onClick={() => { setSettingsOpen(false); showToast("Settings saved"); }}><Check size={15} /> Done</button></div>
          </section>
        </div>
      )}
      {toast && <div className="toast"><Check size={15} /> {toast}</div>}
      {workflowContextMenu && (() => {
        const workflow = workflows.find((item) => item.id === workflowContextMenu.workflowId);
        if (!workflow) return null;
        return (
          <div
            className="workflow-context-menu"
            role="menu"
            aria-label={`${workflow.name} options`}
            style={{ left: workflowContextMenu.x, top: workflowContextMenu.y }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <button role="menuitem" onClick={() => organizeWorkflow(workflow.id)}><LayoutGrid size={14} /> Organize nodes</button>
            <div className="context-menu-divider" />
            <button role="menuitem" onClick={() => { setEditingWorkflow({ id: workflow.id, name: workflow.name }); setWorkflowContextMenu(null); }}><Pencil size={14} /> Rename</button>
            <button role="menuitem" onClick={() => { duplicateWorkflow(workflow.id); setWorkflowContextMenu(null); }}><Copy size={14} /> Duplicate</button>
            <button className="danger" role="menuitem" onClick={() => { deleteWorkflow(workflow.id); setWorkflowContextMenu(null); }}><Trash2 size={14} /> Delete</button>
          </div>
        );
      })()}
    </main>
  );
}
