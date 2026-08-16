export type MathOutputType = "string" | "float" | "integer";

export type MathInputDefinition = {
  id: string;
  variable: string;
};

export type MathInputValue = MathInputDefinition & {
  value: unknown;
};

export function createMathInput(index: number, id = `math-input-${index}`): MathInputDefinition {
  return { id, variable: `input${index}` };
}

export function mathInputVariable(input: MathInputDefinition, index: number) {
  return input.variable.trim() || `input${index + 1}`;
}

export function growMathInputs(
  inputs: MathInputDefinition[],
  connectedPortId: string,
  nextId?: string,
) {
  if (inputs.at(-1)?.id !== connectedPortId) return inputs;
  return [...inputs, createMathInput(inputs.length + 1, nextId)];
}

type Token =
  | { type: "number"; value: number }
  | { type: "identifier"; value: string }
  | { type: "operator"; value: string }
  | { type: "left" }
  | { type: "right" }
  | { type: "comma" }
  | { type: "end" };

const FUNCTIONS: Record<string, (...values: number[]) => number> = {
  abs: Math.abs,
  ceil: Math.ceil,
  floor: Math.floor,
  max: Math.max,
  min: Math.min,
  pow: Math.pow,
  round: Math.round,
  sign: Math.sign,
  sqrt: Math.sqrt,
};

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const rest = source.slice(index);
    const whitespace = rest.match(/^\s+/);
    if (whitespace) {
      index += whitespace[0].length;
      continue;
    }
    const number = rest.match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);
    if (number) {
      tokens.push({ type: "number", value: Number(number[0]) });
      index += number[0].length;
      continue;
    }
    const identifier = rest.match(/^[a-z_][a-z0-9_]*/i);
    if (identifier) {
      tokens.push({ type: "identifier", value: identifier[0] });
      index += identifier[0].length;
      continue;
    }
    if (rest.startsWith("**")) {
      tokens.push({ type: "operator", value: "**" });
      index += 2;
      continue;
    }
    const character = source[index];
    if ("+-*/%^".includes(character)) tokens.push({ type: "operator", value: character });
    else if (character === "(") tokens.push({ type: "left" });
    else if (character === ")") tokens.push({ type: "right" });
    else if (character === ",") tokens.push({ type: "comma" });
    else throw new Error(`Unexpected character “${character}” in math expression.`);
    index += 1;
  }
  tokens.push({ type: "end" });
  return tokens;
}

class MathParser {
  private index = 0;
  private readonly tokens: Token[];
  private readonly variables: ReadonlyMap<string, number>;

  constructor(tokens: Token[], variables: ReadonlyMap<string, number>) {
    this.tokens = tokens;
    this.variables = variables;
  }

  parse() {
    const value = this.expression();
    if (this.peek().type !== "end") throw new Error("Unexpected value at the end of the math expression.");
    if (!Number.isFinite(value)) throw new Error("Math expression must produce a finite number.");
    return value;
  }

  private peek() {
    return this.tokens[this.index];
  }

  private take() {
    return this.tokens[this.index++];
  }

  private expression(): number {
    let value = this.term();
    while (this.peek().type === "operator" && ["+", "-"].includes((this.peek() as { value: string }).value)) {
      const operator = (this.take() as { value: string }).value;
      const right = this.term();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  }

  private term(): number {
    let value = this.unary();
    while (this.peek().type === "operator" && ["*", "/", "%"].includes((this.peek() as { value: string }).value)) {
      const operator = (this.take() as { value: string }).value;
      const right = this.unary();
      if (operator === "*") value *= right;
      else if (operator === "/") value /= right;
      else value %= right;
    }
    return value;
  }

  private unary(): number {
    if (this.peek().type === "operator" && ["+", "-"].includes((this.peek() as { value: string }).value)) {
      const operator = (this.take() as { value: string }).value;
      const value = this.unary();
      return operator === "-" ? -value : value;
    }
    return this.power();
  }

  private power(): number {
    const left = this.primary();
    if (this.peek().type === "operator" && ["^", "**"].includes((this.peek() as { value: string }).value)) {
      this.take();
      return left ** this.unary();
    }
    return left;
  }

  private primary(): number {
    const token = this.take();
    if (token.type === "number") return token.value;
    if (token.type === "left") {
      const value = this.expression();
      if (this.take().type !== "right") throw new Error("Missing closing parenthesis in math expression.");
      return value;
    }
    if (token.type !== "identifier") throw new Error("Expected a number, variable, or function in math expression.");

    const name = token.value;
    if (this.peek().type === "left") {
      this.take();
      const args: number[] = [];
      if (this.peek().type !== "right") {
        while (true) {
          args.push(this.expression());
          if (this.peek().type !== "comma") break;
          this.take();
        }
      }
      if (this.take().type !== "right") throw new Error(`Missing closing parenthesis after ${name}.`);
      const fn = FUNCTIONS[name.toLowerCase()];
      if (!fn) throw new Error(`Unknown math function “${name}”.`);
      return fn(...args);
    }

    if (name.toLowerCase() === "pi") return Math.PI;
    if (name.toLowerCase() === "e") return Math.E;
    if (!this.variables.has(name)) throw new Error(`Math variable “${name}” has no connected value.`);
    return this.variables.get(name)!;
  }
}

export function evaluateMathExpression(
  expression: string,
  inputs: MathInputValue[],
  outputType: MathOutputType = "float",
) {
  const variables = new Map<string, number>();
  inputs.forEach((input, index) => {
    const name = mathInputVariable(input, index);
    const value = typeof input.value === "string" && input.value.trim() === "" ? 0 : Number(input.value);
    if (!Number.isFinite(value)) throw new Error(`Math variable “${name}” must be a number.`);
    variables.set(name, value);
  });
  const normalized = expression.replace(/\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/gi, "$1").trim();
  if (!normalized) throw new Error("Enter a math expression.");
  const result = new MathParser(tokenize(normalized), variables).parse();
  if (outputType === "string") return String(result);
  if (outputType === "integer") return Math.trunc(result);
  return result;
}
