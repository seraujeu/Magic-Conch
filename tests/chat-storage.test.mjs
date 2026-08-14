import assert from "node:assert/strict";
import test from "node:test";

import { chatSessionsFallbackJson } from "../lib/chat-storage.ts";

test("local chat fallback keeps messages but removes large attachment bodies", () => {
  const json = chatSessionsFallbackJson([{
    id: "chat-1",
    messages: [{
      id: "message-1",
      text: "Please inspect this file",
      files: [{ name: "large.pdf", type: "application/pdf", size: 2_000_000, data: "data:application/pdf;base64,AAAA" }],
    }],
  }]);

  const restored = JSON.parse(json);
  assert.equal(restored[0].messages[0].text, "Please inspect this file");
  assert.deepEqual(restored[0].messages[0].files[0], {
    name: "large.pdf",
    type: "application/pdf",
    size: 2_000_000,
    data: "",
  });
  assert.doesNotMatch(json, /base64/);
});
