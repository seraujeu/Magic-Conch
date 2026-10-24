import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

export const workbenchSource = readFileSync(new URL("../../app/workbench.tsx", import.meta.url), "utf8");
export const workbenchAst = ts.createSourceFile("workbench.tsx", workbenchSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

export function findWorkbenchNodes(predicate) {
  const matches = [];
  function visit(node) {
    if (predicate(node)) matches.push(node);
    ts.forEachChild(node, visit);
  }
  visit(workbenchAst);
  return matches;
}

export function compileWorkbenchSnippet(source) {
  return ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
}

/** Runs the actual component handlers without mounting a browser or copying their implementation. */
export function createWorkbenchRuntime(functionNames, globals = {}) {
  const context = vm.createContext({ structuredClone, TextDecoder, TextEncoder, Uint8Array, atob, File, ...globals });
  const declarations = functionNames.map((name) => {
    const [declaration] = findWorkbenchNodes((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
    if (!declaration) throw new Error(`Workbench function ${name} was not found.`);
    return declaration.getText(workbenchAst);
  });
  vm.runInContext(compileWorkbenchSnippet(declarations.join("\n")), context);
  return context;
}
