export type JoinAggregation = "array" | "object" | "concat" | "sum" | "template";

export type JoinInputDefinition = {
  id: string;
  variable: string;
};

export type JoinInputValue = JoinInputDefinition & {
  value: unknown;
};

export function createJoinInput(index: number, id = `join-input-${index}`): JoinInputDefinition {
  return { id, variable: `input${index}` };
}

export function joinInputVariable(input: JoinInputDefinition, index: number) {
  return (typeof input.variable === "string" ? input.variable.trim() : "") || `input${index + 1}`;
}

export function growJoinInputs(
  inputs: JoinInputDefinition[],
  connectedPortId: string,
  nextId?: string,
) {
  if (inputs.at(-1)?.id !== connectedPortId) return inputs;
  return [...inputs, createJoinInput(inputs.length + 1, nextId)];
}

function valueAtPath(value: unknown, path: string[]) {
  return path.reduce<unknown>((current, part) => {
    if (current == null) return undefined;
    return (current as Record<string, unknown>)[part];
  }, value);
}

function stringify(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value ?? "", null, 2);
}

export function defaultJoinTemplate(inputs: JoinInputDefinition[]) {
  return inputs.map((input, index) => `{{${joinInputVariable(input, index)}}}`).join("\n\n");
}

export function aggregateJoinValues(
  operation: JoinAggregation,
  inputs: JoinInputValue[],
  template = "",
): unknown {
  const values = inputs.map((input) => input.value);
  if (operation === "concat") return values.map(stringify).join("");
  if (operation === "sum") return values.reduce<number>((sum, value) => sum + Number(value || 0), 0);
  if (operation === "object") {
    return Object.fromEntries(inputs.map((input, index) => [joinInputVariable(input, index), input.value]));
  }
  if (operation === "template") {
    const variables = new Map(inputs.map((input, index) => [joinInputVariable(input, index), input.value]));
    const source = template || defaultJoinTemplate(inputs);
    return source.replace(/\{\{\s*([a-z][\w-]*(?:\.[\w-]+)*)\s*\}\}/gi, (match, path: string) => {
      const [variable, ...parts] = path.split(".");
      if (!variables.has(variable)) return match;
      const selected = parts.length ? valueAtPath(variables.get(variable), parts) : variables.get(variable);
      return selected == null ? "" : stringify(selected);
    });
  }
  return values;
}
