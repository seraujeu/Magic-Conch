import assert from "node:assert/strict";
import test from "node:test";
import { composeStartInputs } from "../lib/start-inputs.ts";

const file = (name, data = name) => ({ name, data, type: "text/plain", size: data.length });

function details(overrides = {}) {
  return {
    currentMessage: "Latest request",
    currentFiles: [file("current.txt")],
    priorMessages: [],
    workflowFiles: [file("workflow.txt")],
    session: { id: "session-7", number: 7, title: "Planning" },
    workflow: { name: "Planner", description: "Makes a plan" },
    start: { agentName: "Planning agent", startMessage: "What shall we plan?" },
    now: new Date("2026-08-17T02:03:04.000Z"),
    expand: (value) => value.replace("{{date}}", "2026-08-17"),
    ...overrides,
  };
}

test("Start input defaults preserve the existing current-message and file behavior", () => {
  const result = composeStartInputs({}, details());

  assert.equal(result.prompt, "Latest request");
  assert.deepEqual(result.files.map((item) => item.name), ["workflow.txt", "current.txt"]);
  assert.equal(result.includedHistoryCount, 0);
  assert.equal(result.includedCurrentMessage, true);
});

test("Start input selection filters history and adds requested session context", () => {
  const duplicate = file("shared.txt", "same");
  const result = composeStartInputs({
    startIncludePriorUserMessages: true,
    startIncludeAssistantMessages: true,
    startHistoryLimit: 2,
    startIncludeMessageTimes: true,
    startIncludePriorFiles: true,
    startIncludeSessionInfo: true,
    startIncludeWorkflowInfo: true,
    startIncludeStartSettings: true,
    startIncludeRunDateTime: true,
    startAdditionalContext: "Prepared on {{date}}",
  }, details({
    currentFiles: [duplicate],
    priorMessages: [
      { role: "system", text: "Hidden system note", files: [file("system.txt")] },
      { role: "user", text: "Old request", time: "9:00 AM", files: [duplicate] },
      { role: "assistant", text: "Old response", time: "9:01 AM", files: [file("answer.txt")] },
    ],
  }));

  assert.match(result.prompt, /Conversation history:\n\[User · 9:00 AM\] Old request/);
  assert.match(result.prompt, /\[Assistant · 9:01 AM\] Old response/);
  assert.doesNotMatch(result.prompt, /Hidden system note/);
  assert.match(result.prompt, /Current message:\nLatest request/);
  assert.match(result.prompt, /Chat session:[\s\S]*Title: Planning[\s\S]*ID: session-7/);
  assert.match(result.prompt, /Workflow:[\s\S]*Name: Planner[\s\S]*Makes a plan/);
  assert.match(result.prompt, /Start settings:[\s\S]*Planning agent[\s\S]*What shall we plan/);
  assert.match(result.prompt, /Run date and time:\n2026-08-17T02:03:04.000Z/);
  assert.match(result.prompt, /Additional context:\nPrepared on 2026-08-17/);
  assert.deepEqual(result.files.map((item) => item.name), ["workflow.txt", "system.txt", "shared.txt", "answer.txt"]);
  assert.equal(result.includedHistoryCount, 2);
});

test("Start input selection can omit chat text and every file source", () => {
  const result = composeStartInputs({
    startIncludeCurrentMessage: false,
    startIncludeCurrentFiles: false,
    startIncludeWorkflowFiles: false,
  }, details());

  assert.equal(result.prompt, "");
  assert.deepEqual(result.files, []);
  assert.equal(result.includedCurrentMessage, false);
});
