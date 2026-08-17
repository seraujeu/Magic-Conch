import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildAIWorkAssignerSystemPrompt,
  parseAIWorkAssignments,
} from "../lib/ai-work-assigner.ts";

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
