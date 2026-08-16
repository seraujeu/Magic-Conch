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

test("uses configured absolute paths without browser permission handles", async (t) => {
  const projectRoot = await mkdtemp(join(tmpdir(), "magic-conch-project-root-"));
  const absoluteDirectory = await mkdtemp(join(tmpdir(), "magic-conch-absolute-directory-"));
  t.after(() => Promise.all([
    rm(projectRoot, { recursive: true, force: true }),
    rm(absoluteDirectory, { recursive: true, force: true }),
  ]));

  await handleLocalDirectoryRequest(projectRoot, {
    operation: "save-record",
    directory: absoluteDirectory,
    key: "persistent",
    value: "no browser grant",
    saveFiles: "data",
  });
  assert.equal(
    JSON.parse(await readFile(join(absoluteDirectory, "persistent.json"), "utf8")).value,
    "no browser grant",
  );
});

test("materializes bundled Load files with their relative layout", async (t) => {
  const projectRoot = await mkdtemp(join(tmpdir(), "magic-conch-materialized-load-"));
  t.after(() => rm(projectRoot, { recursive: true, force: true }));

  await handleLocalDirectoryRequest(projectRoot, {
    operation: "materialize-load",
    directory: "user-data/workflow-files/demo/load-1",
    key: "부동산 자료",
    value: "bundled value",
    writeRecord: true,
    files: [{
      name: "documents/input.txt",
      type: "text/plain",
      data: "data:text/plain;base64,aGVsbG8=",
      size: 5,
    }],
  });

  assert.equal(
    await readFile(join(projectRoot, "user-data", "workflow-files", "demo", "load-1", "documents", "input.txt"), "utf8"),
    "hello",
  );
  const loaded = await handleLocalDirectoryRequest(projectRoot, {
    operation: "load-record",
    directory: "user-data/workflow-files/demo/load-1",
    key: "부동산 자료",
  });
  assert.equal(loaded.value, "bundled value");
  assert.equal(loaded.files[0].name, "documents/input.txt");
});

test("rejects traversal in materialized bundled file names", async (t) => {
  const projectRoot = await mkdtemp(join(tmpdir(), "magic-conch-materialized-traversal-"));
  t.after(() => rm(projectRoot, { recursive: true, force: true }));
  await assert.rejects(handleLocalDirectoryRequest(projectRoot, {
    operation: "materialize-load",
    files: [{ name: "../outside.txt", type: "text/plain", data: "data:text/plain,unsafe", size: 6 }],
  }), /subfolder path is invalid/);
});

test("keeps All-files-in-folder snapshots isolated by Load node directory", async (t) => {
  const projectRoot = await mkdtemp(join(tmpdir(), "magic-conch-folder-loads-"));
  t.after(() => rm(projectRoot, { recursive: true, force: true }));
  const asset = (data) => ({
    name: "nested/shared.txt",
    type: "text/plain",
    data: `data:text/plain,${data}`,
    size: data.length,
  });

  await handleLocalDirectoryRequest(projectRoot, {
    operation: "materialize-load",
    directory: "user-data/workflow-files/demo/load-a",
    files: [asset("first")],
    writeRecord: false,
  });
  await handleLocalDirectoryRequest(projectRoot, {
    operation: "materialize-load",
    directory: "user-data/workflow-files/demo/load-b",
    files: [asset("second")],
    writeRecord: false,
  });

  const first = await handleLocalDirectoryRequest(projectRoot, {
    operation: "list-files",
    directory: "user-data/workflow-files/demo/load-a",
    recursive: true,
  });
  const second = await handleLocalDirectoryRequest(projectRoot, {
    operation: "list-files",
    directory: "user-data/workflow-files/demo/load-b",
    recursive: true,
  });
  assert.equal(first.files[0].name, "nested/shared.txt");
  assert.equal(second.files[0].name, "nested/shared.txt");
  assert.notEqual(first.files[0].data, second.files[0].data);
});
