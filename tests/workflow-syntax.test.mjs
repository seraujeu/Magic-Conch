import assert from "node:assert/strict";
import test from "node:test";

import { expandWorkflowSyntax, expandWorkflowSyntaxInValue } from "../lib/workflow-syntax.ts";

const context = {
  now: new Date(2026, 7, 11, 5, 6, 7),
  chatSessionNumber: 12,
  chatSessionId: "session-abc",
  chatSessionTitle: "Daily report",
  workflowName: "Research flow",
};

test("expands date, time, chat, and workflow syntax", () => {
  assert.equal(
    expandWorkflowSyntax("{{date}} {{time-hour}}:{{time-minute}}:{{time-second}} #{{chat-session-number}} {{workflow-name}}", context),
    "2026-08-11 05:06:07 #12 Research flow",
  );
});

test("expands nested workflow configuration while preserving unknown template tokens", () => {
  const config = expandWorkflowSyntaxInValue({
    prompt: "Session {{chat-session-id}}",
    template: "{{value}} at {{time}}",
    routes: [{ value: "{{date-year}}" }],
  }, context);

  assert.deepEqual(config, {
    prompt: "Session session-abc",
    template: "{{value}} at 05:06:07",
    routes: [{ value: "2026" }],
  });
});
