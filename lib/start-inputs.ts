export type StartInputFile = {
  name: string;
  type: string;
  data: string;
  size: number;
};

export type StartInputMessage<F extends StartInputFile = StartInputFile> = {
  role: "user" | "assistant" | "system";
  text: string;
  time?: string;
  files?: F[];
};

export type StartInputConfig = {
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
};

export type StartInputDetails<F extends StartInputFile = StartInputFile> = {
  currentMessage: string;
  currentFiles: F[];
  priorMessages: StartInputMessage<F>[];
  session: { id: string; number: number; title: string };
  workflow: { name: string; description: string };
  start: { agentName: string; startMessage: string };
  now: Date;
  expand?: (value: string) => string;
};

function enabled(value: boolean | undefined, fallback: boolean) {
  return value === undefined ? fallback : value;
}

function distinctFiles<F extends StartInputFile>(files: F[]) {
  return files.filter((file, index) => files.findIndex((candidate) => (
    candidate.data === file.data
    && candidate.name === file.name
    && candidate.type === file.type
    && candidate.size === file.size
  )) === index);
}

function formatMessage(message: StartInputMessage, includeTime: boolean) {
  const role = message.role === "user" ? "User" : message.role === "assistant" ? "Assistant" : "System";
  const time = includeTime && message.time ? ` · ${message.time}` : "";
  return `[${role}${time}] ${message.text}`;
}

export function composeStartInputs<F extends StartInputFile>(
  config: StartInputConfig,
  details: StartInputDetails<F>,
) {
  const includeCurrentMessage = enabled(config.startIncludeCurrentMessage, true);
  const includePriorUserMessages = enabled(config.startIncludePriorUserMessages, false);
  const includeAssistantMessages = enabled(config.startIncludeAssistantMessages, false);
  const includeSystemMessages = enabled(config.startIncludeSystemMessages, false);
  const historyLimit = Math.max(1, Math.min(100, Math.trunc(config.startHistoryLimit ?? 20)));
  const includedHistory = details.priorMessages
    .filter((message) => (
      (message.role === "user" && includePriorUserMessages)
      || (message.role === "assistant" && includeAssistantMessages)
      || (message.role === "system" && includeSystemMessages)
    ))
    .slice(-historyLimit);

  const sections: string[] = [];
  if (includedHistory.length) {
    sections.push(`Conversation history:\n${includedHistory.map((message) => formatMessage(message, enabled(config.startIncludeMessageTimes, false))).join("\n\n")}`);
  }
  if (includeCurrentMessage && details.currentMessage) {
    sections.push(`Current message:\n${details.currentMessage}`);
  }
  if (enabled(config.startIncludeSessionInfo, false)) {
    sections.push([
      "Chat session:",
      `- Title: ${details.session.title}`,
      `- Number: ${details.session.number}`,
      `- ID: ${details.session.id}`,
    ].join("\n"));
  }
  if (enabled(config.startIncludeWorkflowInfo, false)) {
    sections.push([
      "Workflow:",
      `- Name: ${details.workflow.name}`,
      `- Description: ${details.workflow.description || "(none)"}`,
    ].join("\n"));
  }
  if (enabled(config.startIncludeStartSettings, false)) {
    sections.push([
      "Start settings:",
      `- Agent name: ${details.start.agentName}`,
      `- Opening message: ${details.start.startMessage}`,
    ].join("\n"));
  }
  if (enabled(config.startIncludeRunDateTime, false)) {
    sections.push(`Run date and time:\n${details.now.toISOString()}`);
  }
  const additionalContext = (details.expand?.(config.startAdditionalContext || "") ?? config.startAdditionalContext ?? "").trim();
  if (additionalContext) sections.push(`Additional context:\n${additionalContext}`);

  const hasAddedContext = includedHistory.length
    || enabled(config.startIncludeSessionInfo, false)
    || enabled(config.startIncludeWorkflowInfo, false)
    || enabled(config.startIncludeStartSettings, false)
    || enabled(config.startIncludeRunDateTime, false)
    || Boolean(additionalContext);
  const prompt = includeCurrentMessage && !hasAddedContext
    ? details.currentMessage
    : sections.join("\n\n");

  const files = distinctFiles([
    ...(enabled(config.startIncludePriorFiles, false) ? details.priorMessages.flatMap((message) => message.files || []) : []),
    ...(enabled(config.startIncludeCurrentFiles, true) ? details.currentFiles : []),
  ]);

  return {
    prompt,
    files,
    includedHistoryCount: includedHistory.length,
    includedCurrentMessage: includeCurrentMessage && Boolean(details.currentMessage),
  };
}
