import assert from "node:assert/strict";
import test from "node:test";
import { loadChatSession } from "../lib/chat-session-node.ts";

const file = (name, data = name) => ({ name, data, type: "text/plain", size: data.length });

const details = {
  id: "session-12",
  number: 12,
  title: "Launch planning",
  updatedAt: "2026-08-17T03:00:00.000Z",
  messages: [
    { role: "system", text: "Internal note", files: [file("private.txt")] },
    { role: "user", text: "Draft a launch plan", time: "10:00 AM", files: [file("brief.txt")] },
    { role: "assistant", text: "What is the launch date?", time: "10:01 AM" },
    { role: "user", text: "October 1", time: "10:02 AM", files: [file("brief.txt")] },
  ],
};

test("Chat Session defaults expose recent user and assistant history", () => {
  const result = loadChatSession({}, details);

  assert.doesNotMatch(result.history, /Internal note/);
  assert.match(result.history, /\[User\] Draft a launch plan/);
  assert.match(result.history, /\[Assistant\] What is the launch date\?/);
  assert.doesNotMatch(result.history, /10:00 AM/);
  assert.deepEqual(result.files.map((item) => item.name), ["brief.txt"]);
  assert.equal(result.session.id, "session-12");
  assert.equal(result.session.previousMessageCount, 3);
  assert.equal(result.session.totalPreviousMessageCount, 4);
});

test("Chat Session role, limit, time, and attachment controls are applied together", () => {
  const result = loadChatSession({
    sessionIncludeUserMessages: false,
    sessionIncludeAssistantMessages: true,
    sessionIncludeSystemMessages: true,
    sessionHistoryLimit: 1,
    sessionIncludeMessageTimes: true,
    sessionIncludeAttachments: false,
  }, details);

  assert.equal(result.history, "Conversation history:\n[Assistant · 10:01 AM] What is the launch date?");
  assert.deepEqual(result.messages.map((message) => message.role), ["assistant"]);
  assert.deepEqual(result.files, []);
});

test("Chat Session returns empty history when no roles are enabled", () => {
  const result = loadChatSession({
    sessionIncludeUserMessages: false,
    sessionIncludeAssistantMessages: false,
    sessionIncludeSystemMessages: false,
  }, details);

  assert.equal(result.history, "");
  assert.deepEqual(result.messages, []);
  assert.equal(result.session.previousMessageCount, 0);
});
