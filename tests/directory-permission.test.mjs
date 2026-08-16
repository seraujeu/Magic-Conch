import test from "node:test";
import assert from "node:assert/strict";
import {
  ensureDirectoryPermission,
  rememberDirectoryPermission,
} from "../lib/directory-permission.ts";

test("reuses a granted directory permission for later file operations", async () => {
  let queries = 0;
  let requests = 0;
  const handle = {
    name: "exports",
    async queryPermission() {
      queries += 1;
      return "prompt";
    },
    async requestPermission() {
      requests += 1;
      return "granted";
    },
  };

  await ensureDirectoryPermission(handle, "readwrite");
  await ensureDirectoryPermission(handle, "readwrite");
  await ensureDirectoryPermission(handle, "read");

  assert.equal(queries, 1);
  assert.equal(requests, 1);
});

test("recognizes access already granted by the directory picker", async () => {
  const handle = {
    name: "database",
    async queryPermission() {
      throw new Error("the picker grant should be reused without another query");
    },
  };

  rememberDirectoryPermission(handle, "readwrite");
  await ensureDirectoryPermission(handle, "readwrite");
  await ensureDirectoryPermission(handle, "read");
});

test("coalesces concurrent permission requests for the same directory", async () => {
  let requests = 0;
  const handle = {
    name: "media",
    async queryPermission() {
      return "prompt";
    },
    async requestPermission() {
      requests += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return "granted";
    },
  };

  await Promise.all([
    ensureDirectoryPermission(handle, "read"),
    ensureDirectoryPermission(handle, "read"),
  ]);

  assert.equal(requests, 1);
});

test("reports a denied directory permission", async () => {
  const handle = {
    name: "private",
    async queryPermission() {
      return "denied";
    },
    async requestPermission() {
      return "denied";
    },
  };

  await assert.rejects(
    ensureDirectoryPermission(handle, "read"),
    /Allow read access to “private”/,
  );
});
