import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildAIWorkAssignerSystemPrompt,
  parseAIWorkAssignments,
} from "../lib/ai-work-assigner.ts";

import { isWorkflowNodeActive } from "../lib/workflow-scheduler.ts";

const outputs = [
  { id: "research", label: "Researcher" },
  { id: "draft", label: "Writer", activation: "The request needs original prose or editing.", exportInstruction: "Export a concise drafting brief with audience, tone, and required sections." },
  { id: "review", label: "Reviewer" },
];

test("adds the configured system prompt and an explicit output contract", () => {
  const prompt = buildAIWorkAssignerSystemPrompt("Assign only relevant specialists.", outputs);
  assert.match(prompt, /^Assign only relevant specialists\./);
  assert.match(prompt, /<Researcher>Prompt for Researcher<\/Researcher>/);
  assert.match(prompt, /Activate when: The request needs original prose or editing\./);
  assert.match(prompt, /What to export: Export a concise drafting brief with audience, tone, and required sections\./);
  assert.match(prompt, /complete, standalone natural-language prompt for the AI Request node/);
  assert.match(prompt, /Do not include a tag for an output that should remain inactive/);
});

test("activates only outputs explicitly included in the AI response", () => {
  const assignments = parseAIWorkAssignments(`
<Researcher>Find three primary sources about the topic.</Researcher>
<Reviewer>
Check the final claims against the sources.
</Reviewer>
`, outputs);

  assert.equal(assignments.get("research"), "Find three primary sources about the topic.");
  assert.equal(assignments.get("review"), "Check the final claims against the sources.");
  assert.equal(assignments.has("draft"), false);
});

test("ignores output names mentioned without a complete matching section", () => {
  const assignments = parseAIWorkAssignments(
    "The Writer could help later, but no work should be assigned yet.",
    outputs,
  );
  assert.equal(assignments.size, 0);
});

test("combines repeated sections for the same output", () => {
  const assignments = parseAIWorkAssignments(`
<Writer>Write the introduction.</Writer>
<Researcher>Collect the dates.</Researcher>
<Writer>Then add a short conclusion.</Writer>
`, outputs);
  assert.equal(assignments.get("draft"), "Write the introduction.\n\nThen add a short conclusion.");
});

test("supports human-readable output names containing spaces", () => {
  const assignments = parseAIWorkAssignments(
    "<Fact Checker>Verify every numerical claim.</Fact Checker>",
    [{ id: "facts", label: "Fact Checker" }],
  );
  assert.equal(assignments.get("facts"), "Verify every numerical claim.");
});

test("new assigner nodes include a detailed editable reference system prompt", async () => {
  const workbench = await readFile(new URL("../app/workbench.tsx", import.meta.url), "utf8");
  assert.match(workbench, /const DEFAULT_AI_WORK_ASSIGNER_SYSTEM_PROMPT = \[/);
  assert.match(workbench, /Activate every output whose role is genuinely useful/);
  assert.match(workbench, /Write a complete, standalone instruction that can be sent directly to another AI model/);
  assert.match(workbench, /systemPrompt: DEFAULT_AI_WORK_ASSIGNER_SYSTEM_PROMPT/);
});

test("AI-powered routing nodes accept every file input and send attachments to the model", async () => {
  const workbench = await readFile(new URL("../app/workbench.tsx", import.meta.url), "utf8");
  assert.match(workbench, /const fileInputs: PortSpec\[\] = \[\{ id: "files"[\s\S]*\.\.\.mediaInputs, documentIn\];/);
  assert.match(workbench, /if \(node\.type === "ai-assigner"\)[\s\S]*?inputs: \[[^\n]+\.\.\.fileInputs\]/);
  assert.match(workbench, /if \(node\.type === "router-ai" \|\| node\.type === "router-rule"\)[\s\S]*?inputs: \[[^\n]+\.\.\.fileInputs\]/);
  assert.match(workbench, /if \(node\.type === "condition-ai" \|\| node\.type === "condition-rule"\)[\s\S]*?inputs: \[[^\n]+\.\.\.fileInputs\]/);
  assert.match(workbench, /if \(node\.type === "ai-assigner"\)[\s\S]*?fileAssetsPromptSections\(fileInput\)[\s\S]*?files: fileInput/);
  assert.match(workbench, /if \(node\.type === "router-ai"\)[\s\S]*?fileAssetsPromptSections\(fileInput\)[\s\S]*?files: fileInput/);
});


test("empty assignments leave connected workers inactive even with active file inputs", () => {
  const assignments = parseAIWorkAssignments(
    "<Writer> \n\t </Writer><Researcher>Find sources.</Researcher><Reviewer></Reviewer>",
    outputs,
  );
  assert.deepEqual([...assignments], [["research", "Find sources."]]);
  const emittedPortKeys = new Set(["start:files", ...[...assignments.keys()].map((id) => `assigner:${id}`)]);
  for (const output of outputs) {
    assert.equal(isWorkflowNodeActive({
      nodeType: "request",
      inputPorts: [{ id: "prompt" }, { id: "files" }],
      incoming: [
        { from: "assigner", fromPort: output.id, toPort: "prompt" },
        { from: "start", fromPort: "files", toPort: "files" },
      ],
      emittedPortKeys,
    }), output.id === "research");
  }
});

test("ignores empty repeated sections while keeping actual assignments", () => {
  const assignments = parseAIWorkAssignments(
    "<Writer></Writer><Writer>First task.</Writer><Writer> </Writer><Writer>Second task.</Writer>",
    outputs,
  );
  assert.deepEqual([...assignments], [["draft", "First task.\n\nSecond task."]]);
});

for (const labels of [["Writer", "Writer"], ["Writer", "writer"], ["Writer", "<Writer>"], ["Writer", " Writer "]]) {
  test(`colliding labels ${JSON.stringify(labels)} can be selected independently`, () => {
    const options = labels.map((label, index) => ({ id: `worker-${index}`, label }));
    const prompt = buildAIWorkAssignerSystemPrompt("", options);
    const tags = [...prompt.matchAll(/^- <([^>]+)>/gm)].map((match) => match[1]);
    assert.equal(tags.length, options.length);
    assert.equal(new Set(tags.map((tag) => tag.toLowerCase())).size, options.length);
    tags.forEach((tag, index) => {
      assert.deepEqual([...parseAIWorkAssignments(`<${tag}>Only this worker.</${tag}>`, options)], [
        [options[index].id, "Only this worker."],
      ]);
    });
    assert.equal(parseAIWorkAssignments("<Writer>Ambiguous work.</Writer>", options).size, 0);
  });
}

test("generated tags avoid configured names and support names that become empty", () => {
  const options = [
    { id: "a", label: "Writer" },
    { id: "b", label: "writer" },
    { id: "c", label: "assignment-1" },
    { id: "d", label: "ASSIGNMENT-1-2" },
    { id: "e", label: "<>" },
    { id: "f", label: "" },
  ];
  const prompt = buildAIWorkAssignerSystemPrompt("", options);
  const tags = [...prompt.matchAll(/^- <([^>]+)>/gm)].map((match) => match[1]);
  assert.equal(tags.length, options.length);
  assert.equal(new Set(tags.map((tag) => tag.toLowerCase())).size, options.length);
  tags.forEach((tag, index) => {
    assert.deepEqual([...parseAIWorkAssignments(`<${tag}>Task.</${tag}>`, options)], [[options[index].id, "Task."]]);
  });
});
