import assert from "node:assert/strict";
import test from "node:test";

import { replaceWithResentBranch, switchResentBranch } from "../lib/chat-branches.ts";

const message = (id, role, text) => ({ id, role, text, time: "now" });

test("resending replaces the selected message and its following conversation", () => {
  const original = [
    message("intro", "assistant", "Hello"),
    message("question", "user", "Try this"),
    message("answer", "assistant", "Old answer"),
  ];

  const resent = replaceWithResentBranch(
    original,
    "question",
    message("resent", "user", "Try this"),
  );

  assert.deepEqual(resent.map(({ id }) => id), ["intro", "resent"]);
  assert.equal(resent[1].branch.activeIndex, 1);
  assert.equal(resent[1].branch.versions.length, 2);
});

test("users can switch back to the old conversation and return to the resent one", () => {
  const original = [
    message("intro", "assistant", "Hello"),
    message("question", "user", "Try this"),
    message("answer", "assistant", "Old answer"),
  ];
  const resent = [
    ...replaceWithResentBranch(original, "question", message("resent", "user", "Try this")),
    message("new-answer", "assistant", "New answer"),
  ];

  const oldBranch = switchResentBranch(resent, "resent", 0);
  assert.deepEqual(oldBranch.map(({ id }) => id), ["intro", "question", "answer"]);
  assert.equal(oldBranch[1].branch.activeIndex, 0);

  const newBranch = switchResentBranch(oldBranch, "question", 1);
  assert.deepEqual(newBranch.map(({ id }) => id), ["intro", "resent", "new-answer"]);
  assert.equal(newBranch[1].branch.activeIndex, 1);
});
