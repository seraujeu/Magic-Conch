import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  DEFAULT_LOCAL_DIRECTORY,
  handleLocalDirectoryRequest,
  isLoopbackHostname,
  resolveConfiguredDirectory,
} from "../build/local-directory-vite-plugin.ts";

test("keeps user-data out of Git uploads", async () => {
  const gitignore = await readFile(new URL("../.gitignore", import.meta.url), "utf8");
  assert.match(gitignore, /^\/user-data\/$/m);
});

test("limits the filesystem bridge to loopback hosts", () => {
  assert.equal(isLoopbackHostname("localhost"), true);
  assert.equal(isLoopbackHostname("127.0.0.1"), true);
  assert.equal(isLoopbackHostname("::1"), true);
  assert.equal(isLoopbackHostname("example.com"), false);
});

test("defaults local file operations to the project user-data directory", async (t) => {
  const projectRoot = await mkdtemp(join(tmpdir(), "magic-conch-local-directory-"));
  t.after(() => rm(projectRoot, { recursive: true, force: true }));

  assert.equal(resolveConfiguredDirectory(projectRoot), join(projectRoot, DEFAULT_LOCAL_DIRECTORY));
  await handleLocalDirectoryRequest(projectRoot, {
    operation: "save-record",
    key: "example",
    value: "saved locally",
    files: [{
      name: "note.txt",
      type: "text/plain",
      data: "data:text/plain;base64,aGVsbG8=",
      size: 5,
    }],
    saveFiles: "both",
    collision: "increment",
  });

  assert.equal(await readFile(join(projectRoot, "user-data", "note.txt"), "utf8"), "hello");
  const stored = JSON.parse(await readFile(join(projectRoot, "user-data", "example.json"), "utf8"));
  assert.equal(stored.value, "saved locally");
  assert.deepEqual(stored.files, ["note.txt"]);

  const loaded = await handleLocalDirectoryRequest(projectRoot, {
    operation: "load-record",
    key: "example",
    loadMode: "latest",
  });
  assert.equal(loaded.found, true);
  assert.equal(loaded.value, "saved locally");
  assert.equal(loaded.files[0].name, "note.txt");
  assert.match(loaded.files[0].data, /^data:text\/plain;base64,/);
});

test("uses a configured relative directory and keeps subfolders below it", async (t) => {
  const projectRoot = await mkdtemp(join(tmpdir(), "magic-conch-configured-directory-"));
  t.after(() => rm(projectRoot, { recursive: true, force: true }));

  await handleLocalDirectoryRequest(projectRoot, {
    operation: "save-record",
    directory: "private-files",
    subfolder: ["reports", "2026"],
    key: "summary",
    value: "ready",
    saveFiles: "data",
  });
  assert.equal(
    JSON.parse(await readFile(join(projectRoot, "private-files", "reports", "2026", "summary.json"), "utf8")).value,
    "ready",
  );

  await assert.rejects(
    handleLocalDirectoryRequest(projectRoot, {
      operation: "list-files",
      directory: "private-files",
      subfolder: ["..", "outside"],
    }),
    /subfolder path is invalid/,
  );
});
