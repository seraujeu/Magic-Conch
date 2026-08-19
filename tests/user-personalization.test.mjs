import test from "node:test";
import assert from "node:assert/strict";
import {
  applyUserMemoryOperation,
  formatUserMemory,
  formatUserSettings,
  normalizeUserMemories,
} from "../lib/user-personalization.ts";

test("normalizes and formats stored personalization", () => {
  const memories = normalizeUserMemories([{ id: "m1", content: "  Likes concise answers.  ", createdAt: "2026-01-01" }, null]);
  assert.equal(memories.length, 1);
  assert.equal(formatUserMemory(memories), "- Likes concise answers.");
  assert.equal(formatUserSettings("Use Korean", memories), "## User preference\nUse Korean\n\n## User memory\n- Likes concise answers.");
});

test("adds, updates, deletes, and clears memories", () => {
  const added = applyUserMemoryOperation([], "add", { content: "Lives in Seoul", now: "2026-01-01", createId: () => "m1" });
  assert.equal(added.memory?.id, "m1");
  const updated = applyUserMemoryOperation(added.memories, "update", { memoryId: "m1", content: "Lives near Seoul", now: "2026-01-02" });
  assert.equal(updated.memories[0].content, "Lives near Seoul");
  assert.equal(updated.memories[0].createdAt, "2026-01-01");
  assert.equal(updated.memories[0].updatedAt, "2026-01-02");
  assert.equal(applyUserMemoryOperation(updated.memories, "delete", { memoryId: "m1" }).memories.length, 0);
  assert.equal(applyUserMemoryOperation(added.memories, "clear").memories.length, 0);
});

test("rejects incomplete memory updates", () => {
  assert.throws(() => applyUserMemoryOperation([], "add", { content: " " }), /memory content/i);
  assert.throws(() => applyUserMemoryOperation([], "update", { content: "new" }), /memory ID/i);
});
