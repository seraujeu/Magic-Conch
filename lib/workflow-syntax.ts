export type WorkflowSyntaxContext = {
  now: Date;
  chatSessionNumber: number;
  chatSessionId: string;
  chatSessionTitle: string;
  workflowName: string;
};

export const WORKFLOW_SYNTAX = [
  { token: "{{date}}", description: "Local date (YYYY-MM-DD)" },
  { token: "{{date-year}}", description: "Four-digit year" },
  { token: "{{date-month}}", description: "Two-digit month" },
  { token: "{{date-day}}", description: "Two-digit day" },
  { token: "{{date-weekday}}", description: "Local weekday name" },
  { token: "{{time}}", description: "Local time (HH:mm:ss)" },
  { token: "{{time-hour}}", description: "Two-digit hour (00–23)" },
  { token: "{{time-minute}}", description: "Two-digit minute" },
  { token: "{{time-second}}", description: "Two-digit second" },
  { token: "{{timestamp}}", description: "ISO date and time" },
  { token: "{{chat-session-number}}", description: "Stable chat number" },
  { token: "{{chat-session-id}}", description: "Chat session ID" },
  { token: "{{chat-session-title}}", description: "Chat session title" },
  { token: "{{workflow-name}}", description: "Current workflow name" },
] as const;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function workflowSyntaxValues(context: WorkflowSyntaxContext): Record<string, string> {
  const { now } = context;
  const year = String(now.getFullYear());
  const month = pad(now.getMonth() + 1);
  const day = pad(now.getDate());
  const hour = pad(now.getHours());
  const minute = pad(now.getMinutes());
  const second = pad(now.getSeconds());

  return {
    date: `${year}-${month}-${day}`,
    "date-year": year,
    "date-month": month,
    "date-day": day,
    "date-weekday": new Intl.DateTimeFormat([], { weekday: "long" }).format(now),
    time: `${hour}:${minute}:${second}`,
    "time-hour": hour,
    "time-minute": minute,
    "time-second": second,
    timestamp: now.toISOString(),
    "chat-session-number": String(context.chatSessionNumber),
    "chat-session-id": context.chatSessionId,
    "chat-session-title": context.chatSessionTitle,
    "workflow-name": context.workflowName,
  };
}

export function expandWorkflowSyntax(value: string, context: WorkflowSyntaxContext) {
  const values = workflowSyntaxValues(context);
  return value.replace(/\{\{\s*([a-z][a-z0-9-]*)\s*\}\}/gi, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key.toLowerCase()) ? values[key.toLowerCase()] : match,
  );
}

export function expandWorkflowSyntaxInValue<T>(value: T, context: WorkflowSyntaxContext): T {
  if (typeof value === "string") return expandWorkflowSyntax(value, context) as T;
  if (Array.isArray(value)) return value.map((item) => expandWorkflowSyntaxInValue(item, context)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, expandWorkflowSyntaxInValue(item, context)]),
    ) as T;
  }
  return value;
}
