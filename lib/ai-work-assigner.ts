export type AIWorkOutput = {
  id: string;
  label: string;
  activation?: string;
  exportInstruction?: string;
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function outputTagName(output: AIWorkOutput) {
  return (output.label.trim() || output.id).replace(/[<>]/g, "");
}

export function buildAIWorkAssignerSystemPrompt(systemPrompt: string, outputs: AIWorkOutput[]) {
  const instructions = [
    "You assign the incoming work to zero or more available outputs.",
    "Follow the configured system instructions above when deciding which outputs to activate and what work each should receive.",
    "For every output you activate, return one XML-style section using that output's exact tag name.",
    "The text inside each section must be a complete, standalone natural-language prompt for the AI Request node connected to that output.",
    "You may activate multiple outputs. Do not include a tag for an output that should remain inactive.",
    "Return only output sections, with no explanation or text outside them. Do not invent tags.",
    "",
    "Allowed output sections, activation criteria, and export requirements:",
    ...outputs.map((output) => {
      const tag = outputTagName(output);
      const activation = output.activation?.trim() || "Use the configured system prompt and this output's name to decide.";
      const exportInstruction = output.exportInstruction?.trim() || "Export a complete prompt tailored to this output's named role.";
      return `- <${tag}>Prompt for ${output.label || output.id}</${tag}>\n  Activate when: ${activation}\n  What to export: ${exportInstruction}`;
    }),
  ].join("\n");

  return [systemPrompt.trim(), instructions].filter(Boolean).join("\n\n");
}

export function parseAIWorkAssignments(response: string, outputs: AIWorkOutput[]) {
  const assignments = new Map<string, string>();
  outputs.forEach((output) => {
    const tag = escapeRegExp(outputTagName(output));
    if (!tag) return;
    const pattern = new RegExp(`<\\s*${tag}\\s*>([\\s\\S]*?)<\\/\\s*${tag}\\s*>`, "gi");
    const prompts = [...response.matchAll(pattern)].map((match) => match[1].trim());
    if (prompts.length) assignments.set(output.id, prompts.join("\n\n"));
  });
  return assignments;
}
