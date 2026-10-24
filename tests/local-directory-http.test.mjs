import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import ts from "typescript";

import { localDirectory } from "../build/local-directory-vite-plugin.ts";

// Compile the actual route while resolving its bundler-style import for Node.
const routeSource = await readFile(new URL("../app/api/local-directory/route.ts", import.meta.url), "utf8");
const routeCode = ts.transpileModule(routeSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText.replace(
  '"../../../build/local-directory-vite-plugin"',
  JSON.stringify(new URL("../build/local-directory-vite-plugin.ts", import.meta.url).href),
);
const { POST } = await import(`data:text/javascript;base64,${Buffer.from(routeCode).toString("base64")}`);

function middlewareEndpoint(projectRoot) {
  const plugin = localDirectory();
  plugin.configResolved({ root: projectRoot });
  let middleware;
  plugin.configureServer({ middlewares: { use(handler) { middleware = handler; } } });
  return (target, headers, body) => new Promise((resolve) => {
    const url = new URL(target);
    const request = Readable.from([JSON.stringify(body)]);
    request.method = "POST";
    request.url = url.pathname;
    request.headers = { host: url.host, ...headers };
    request.socket = { encrypted: url.protocol === "https:" };
    const response = {
      statusCode: 0,
      setHeader() {},
      end(value) { resolve({ status: this.statusCode, body: JSON.parse(value) }); },
    };
    middleware(request, response, () => resolve({ status: 404 }));
  });
}

async function routeEndpoint(target, headers, body) {
  const response = await POST(new Request(target, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  }));
  return { status: response.status, body: await response.json() };
}

for (const implementation of ["middleware", "route"]) {
  test(`${implementation} rejects unauthorized filesystem writes before changing files`, async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "magic-conch-http-denied-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const endpoint = implementation === "middleware" ? middlewareEndpoint(directory) : routeEndpoint;
    const victim = join(directory, "victim.txt");
    await writeFile(victim, "original");
    const body = {
      operation: "save-record",
      directory,
      collision: "overwrite",
      saveFiles: "files",
      files: [{ name: "victim.txt", type: "text/plain", data: "data:text/plain,changed", size: 7 }],
    };
    const cases = [
      { headers: { origin: "http://localhost:9000", "content-type": "text/plain" }, status: 403 },
      { headers: { origin: "http://localhost:9000", "content-type": "application/json" }, status: 403 },
      { headers: { "content-type": "application/json" }, status: 403 },
      { headers: { origin: "null", "content-type": "application/json" }, status: 403 },
      { headers: { origin: "https://localhost:4173", "content-type": "application/json" }, status: 403 },
      { headers: { origin: "http://localhost:4173", "content-type": "text/plain" }, status: 415 },
      { headers: { origin: "http://localhost:4173", "content-type": "application/x-www-form-urlencoded" }, status: 415 },
      { target: "http://example.com:4173/api/local-directory", headers: { origin: "http://example.com:4173", "content-type": "application/json" }, status: 404 },
    ];
    for (const scenario of cases) {
      const response = await endpoint(scenario.target || "http://localhost:4173/api/local-directory", scenario.headers, body);
      assert.equal(response.status, scenario.status, JSON.stringify(scenario));
      assert.equal(await readFile(victim, "utf8"), "original");
    }
  });

  test(`${implementation} permits same-origin JSON requests for supported local URLs`, async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "magic-conch-http-allowed-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const endpoint = implementation === "middleware" ? middlewareEndpoint(directory) : routeEndpoint;
    for (const origin of ["http://localhost:4173", "http://127.0.0.1:4173", "http://[::1]:4173", "https://localhost:4173"]) {
      const response = await endpoint(`${origin}/api/local-directory`, {
        origin,
        "content-type": "Application/JSON; charset=UTF-8",
      }, { operation: "save-record", directory, key: "allowed", value: origin, saveFiles: "data", collision: "overwrite" });
      assert.equal(response.status, 200, origin);
      assert.equal(JSON.parse(await readFile(join(directory, "allowed.json"), "utf8")).value, origin);
    }
  });
}
