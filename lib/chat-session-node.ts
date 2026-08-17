export type ChatSessionFile = {
  name: string;
  type: string;
  data: string;
  size: number;
};

export type ChatSessionMessage<F extends ChatSessionFile = ChatSessionFile> = {
  role: "user" | "assistant" | "system";
  text: string;
  time?: string;
  files?: F[];
};

export type ChatSessionNodeConfig = {
  sessionIncludeUserMessages?: boolean;
  sessionIncludeAssistantMessages?: boolean;
  sessionIncludeSystemMessages?: boolean;
  sessionHistoryLimit?: number;
  sessionIncludeMessageTimes?: boolean;
  sessionIncludeAttachments?: boolean;
};

export type ChatSessionNodeDetails<F extends ChatSessionFile = ChatSessionFile> = {
  id: string;
  number: number;
  title: string;
  updatedAt: string;
  messages: ChatSessionMessage<F>[];
};

function enabled(value: boolean | undefined, fallback: boolean) {
  return value === undefined ? fallback : value;
}

function distinctFiles<F extends ChatSessionFile>(files: F[]) {
  return files.filter((file, index) => files.findIndex((candidate) => (
    candidate.data === file.data
    && candidate.name === file.name
    && candidate.type === file.type
    && candidate.size === file.size
  )) === index);
}

function formatMessage(message: ChatSessionMessage, includeTime: boolean) {
  const role = message.role === "user" ? "User" : message.role === "assistant" ? "Assistant" : "System";
  const time = includeTime && message.time ? ` · ${message.time}` : "";
  return `[${role}${time}] ${message.text}`;
}

/** Selects and formats the active session snapshot exposed by a Chat Session node. */
export function loadChatSession<F extends ChatSessionFile>(
  config: ChatSessionNodeConfig,
  details: ChatSessionNodeDetails<F>,
) {
  const limit = Math.max(1, Math.min(100, Math.trunc(config.sessionHistoryLimit ?? 20)));
  const messages = details.messages
    .filter((message) => (
      (message.role === "user" && enabled(config.sessionIncludeUserMessages, true))
      || (message.role === "assistant" && enabled(config.sessionIncludeAssistantMessages, true))
      || (message.role === "system" && enabled(config.sessionIncludeSystemMessages, false))
    ))
    .slice(-limit);
  const files = enabled(config.sessionIncludeAttachments, true)
    ? distinctFiles(messages.flatMap((message) => message.files || []))
    : [];
  const history = messages.length
    ? `Conversation history:\n${messages.map((message) => formatMessage(message, enabled(config.sessionIncludeMessageTimes, false))).join("\n\n")}`
    : "";
  const session = {
    id: details.id,
    number: details.number,
    title: details.title,
    updatedAt: details.updatedAt,
    previousMessageCount: messages.length,
    totalPreviousMessageCount: details.messages.length,
  };

  return { history, messages, files, session };
}
