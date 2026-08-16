export type BooleanRuleMethod =
  | "contains"
  | "not_contains"
  | "equals"
  | "starts_with"
  | "ends_with"
  | "regex"
  | "length_gt"
  | "length_lt"
  | "is_empty"
  | "file_type"
  | "file_count_gt"
  | "number_gt"
  | "number_lt";

export type BooleanConditionFile = { name: string; type: string };

export type BooleanRule = {
  method?: BooleanRuleMethod;
  expected?: string;
  caseSensitive?: boolean;
};

function conditionText(input: unknown) {
  if (typeof input === "string") return input;
  if (input == null) return "";
  try { return JSON.stringify(input); }
  catch { return String(input); }
}

/** Evaluates the deterministic condition shared by Rule Router and Rule Condition. */
export function evaluateBooleanRule(
  input: unknown,
  files: BooleanConditionFile[],
  rule: BooleanRule,
) {
  const method = rule.method || "contains";
  const rawExpected = rule.expected || "";
  const rawSource = conditionText(input);
  const source = rule.caseSensitive ? rawSource : rawSource.toLowerCase();
  const expected = rule.caseSensitive ? rawExpected : rawExpected.toLowerCase();

  if (method === "contains") return source.includes(expected);
  if (method === "not_contains") return !source.includes(expected);
  if (method === "equals") return source === expected;
  if (method === "starts_with") return source.startsWith(expected);
  if (method === "ends_with") return source.endsWith(expected);
  if (method === "regex") {
    try { return new RegExp(rawExpected, rule.caseSensitive ? "" : "i").test(rawSource); }
    catch { return false; }
  }
  if (method === "length_gt") return rawSource.length > Number(rawExpected);
  if (method === "length_lt") return rawSource.length < Number(rawExpected);
  if (method === "is_empty") return rawSource.trim().length === 0;
  if (method === "file_type") {
    const suffix = expected.startsWith(".") ? expected : `.${expected}`;
    return files.some((file) => file.type.toLowerCase().includes(expected) || file.name.toLowerCase().endsWith(suffix));
  }
  if (method === "file_count_gt") return files.length > Number(rawExpected);
  if (method === "number_gt") return Number(rawSource) > Number(rawExpected);
  if (method === "number_lt") return Number(rawSource) < Number(rawExpected);
  return false;
}

/** Converts a model's classifier response into a boolean without guessing. */
export function parseAIBoolean(response: string) {
  const trimmed = response.trim();
  if (/^true[.!]?$/i.test(trimmed)) return true;
  if (/^false[.!]?$/i.test(trimmed)) return false;

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed === "boolean") return parsed;
    if (parsed && typeof parsed === "object") {
      const candidate = (parsed as Record<string, unknown>).result
        ?? (parsed as Record<string, unknown>).matched
        ?? (parsed as Record<string, unknown>).value;
      if (typeof candidate === "boolean") return candidate;
    }
  } catch {
    // The strict textual forms below still support a fenced or prefixed answer.
  }

  const matches = [...trimmed.matchAll(/\b(true|false)\b/gi)];
  if (matches.length === 1) return matches[0][1].toLowerCase() === "true";
  throw new Error("The AI condition did not return one unambiguous true or false value.");
}
