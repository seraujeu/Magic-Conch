import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { acquireUpdateLock, registerRunningApp } from "../scripts/operation-lock.mjs";
import { parseArguments } from "../scripts/update-from-github.mjs";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const updaterFiles = ["operation-lock.mjs", "update-from-github.mjs"];

function command(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: options.cwd,
    encoding: "utf8",
    env: options.env || process.env,
    stdio: "pipe",
  });
  if (options.allowFailure) return result;
  assert.equal(
    result.status,
    0,
    `${executable} ${args.join(" ")} failed\n${result.stdout || ""}\n${result.stderr || ""}`,
  );
  return result;
}

function git(cwd, args, options) {
  return command("git", args, { cwd, ...options });
}

async function commitVersion(seed, version) {
  await writeFile(join(seed, "version.txt"), `${version}\n`, "utf8");
  git(seed, ["add", "version.txt"]);
  git(seed, ["commit", "-m", `version ${version}`]);
  git(seed, ["push", "origin", "main"]);
  return git(seed, ["rev-parse", "HEAD"]).stdout.trim();
}

async function createFakeNpm(directory) {
  await mkdir(directory, { recursive: true });
  if (process.platform === "win32") {
    const path = join(directory, "npm.cmd");
    await writeFile(path, [
      "@echo off",
      ">>\"%FAKE_NPM_LOG%\" echo %CD% npm %*",
      "if \"%1\"==\"ci\" if \"%FAKE_NPM_FAIL_CI%\"==\"1\" exit /b 23",
      "if \"%1\"==\"test\" if \"%FAKE_NPM_FAIL_TEST%\"==\"1\" exit /b 24",
      "if \"%1\"==\"ci\" if not exist node_modules mkdir node_modules",
      "if \"%1\"==\"ci\" echo prepared>node_modules\\prepared.txt",
      "exit /b 0",
      "",
    ].join("\r\n"), "utf8");
    return;
  }

  const path = join(directory, "npm");
  await writeFile(path, [
    "#!/bin/sh",
    "printf '%s npm %s\\n' \"$PWD\" \"$*\" >> \"$FAKE_NPM_LOG\"",
    "[ \"$1\" = ci ] && [ \"${FAKE_NPM_FAIL_CI:-0}\" = 1 ] && exit 23",
    "[ \"$1\" = test ] && [ \"${FAKE_NPM_FAIL_TEST:-0}\" = 1 ] && exit 24",
    "if [ \"$1\" = ci ]; then mkdir -p node_modules; printf 'prepared\\n' > node_modules/prepared.txt; fi",
    "exit 0",
    "",
  ].join("\n"), "utf8");
  await chmod(path, 0o755);
}

async function createUpdaterFixture(t) {
  const root = await mkdtemp(join(tmpdir(), "magic-conch-updater-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const remote = join(root, "remote.git");
  const seed = join(root, "seed");
  const active = join(root, "active");
  const fakeBin = join(root, "fake-bin");
  const npmLog = join(root, "npm.log");

  git(root, ["init", "--bare", "--initial-branch=main", remote]);
  git(root, ["init", "--initial-branch=main", seed]);
  git(seed, ["config", "user.email", "updater-tests@example.invalid"]);
  git(seed, ["config", "user.name", "Updater Tests"]);
  await mkdir(join(seed, "scripts"), { recursive: true });
  await mkdir(join(seed, "plugins"), { recursive: true });
  for (const file of updaterFiles) {
    await copyFile(join(repositoryRoot, "scripts", file), join(seed, "scripts", file));
  }
  await writeFile(join(seed, ".gitignore"), [
    "/.runtime/", "/node_modules/", "/user-data/", "/chats/", "/workflows/",
    "/backups/", "/exports/", "/plugins/*", "!/plugins/README.md", "",
  ].join("\n"), "utf8");
  await writeFile(join(seed, "plugins", "README.md"), "# Plug-ins\n", "utf8");
  await writeFile(join(seed, "package.json"), "{\"private\":true}\n", "utf8");
  await writeFile(join(seed, "package-lock.json"), "{\"name\":\"fixture\",\"lockfileVersion\":3,\"packages\":{\"\":{}}}\n", "utf8");
  await writeFile(join(seed, "version.txt"), "1\n", "utf8");
  git(seed, ["add", "."]);
  git(seed, ["commit", "-m", "version 1"]);
  git(seed, ["remote", "add", "origin", remote]);
  git(seed, ["push", "-u", "origin", "main"]);
  git(root, ["clone", remote, active]);

  await mkdir(join(active, "node_modules"));
  await writeFile(join(active, "node_modules", "old.txt"), "old dependencies\n", "utf8");
  await createFakeNpm(fakeBin);
  const environment = {
    ...process.env,
    PATH: `${fakeBin}${process.platform === "win32" ? ";" : ":"}${process.env.PATH || ""}`,
    MAGIC_CONCH_REPOSITORY: remote,
    MAGIC_CONCH_BRANCH: "main",
    FAKE_NPM_LOG: npmLog,
    FAKE_NPM_FAIL_CI: "0",
    FAKE_NPM_FAIL_TEST: "0",
  };
  const updater = join(active, "scripts", "update-from-github.mjs");
  const runUpdater = (args, overrides = {}) => command(process.execPath, [updater, ...args], {
    cwd: active,
    env: { ...environment, ...overrides },
    allowFailure: true,
  });

  return { active, environment, npmLog, remote, runUpdater, seed };
}

test("rejects unknown update options before doing work", () => {
  assert.throws(() => parseArguments(["--chek"]), /Unknown update option: --chek/);
  assert.deepEqual(parseArguments(["--check", "--skip-tests"]), {
    check: true,
    help: false,
    skipTests: true,
  });
});

test("coordinates launch and update locks", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "magic-conch-lock-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const running = registerRunningApp(root);
  assert.throws(() => acquireUpdateLock(root), /Magic Conch is running/);
  running.release();

  const updating = acquireUpdateLock(root);
  assert.throws(() => registerRunningApp(root), /being updated/);
  updating.release();
});

test("prepares updates before merging and recovers interrupted dependency swaps", async (t) => {
  const fixture = await createUpdaterFixture(t);

  await commitVersion(fixture.seed, 2);
  const failed = fixture.runUpdater(["--skip-tests"], { FAKE_NPM_FAIL_CI: "1" });
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /Update stopped/);
  assert.equal((await readFile(join(fixture.active, "version.txt"), "utf8")).trim(), "1");
  assert.equal(await readFile(join(fixture.active, "node_modules", "old.txt"), "utf8"), "old dependencies\n");

  const updated = fixture.runUpdater([]);
  assert.equal(updated.status, 0, `${updated.stdout}\n${updated.stderr}`);
  assert.equal((await readFile(join(fixture.active, "version.txt"), "utf8")).trim(), "2");
  assert.equal((await readFile(join(fixture.active, "node_modules", "prepared.txt"), "utf8")).trim(), "prepared");
  assert.match(await readFile(fixture.npmLog, "utf8"), /npm ci/);
  assert.match(await readFile(fixture.npmLog, "utf8"), /npm test/);
  assert.notEqual(git(fixture.active, ["show-ref", "--verify", "refs/magic-conch/update-candidate"], { allowFailure: true }).status, 0);

  const candidate = await commitVersion(fixture.seed, 3);
  const token = randomUUID();
  const runtime = join(fixture.active, ".runtime");
  const backup = join(runtime, `update-node-modules-${token}`);
  await mkdir(runtime, { recursive: true });
  await rename(join(fixture.active, "node_modules"), backup);
  await mkdir(join(fixture.active, "node_modules"));
  await writeFile(join(fixture.active, "node_modules", "partial.txt"), "partial\n", "utf8");
  await writeFile(join(runtime, "update-transaction.json"), `${JSON.stringify({
    version: 1,
    token,
    phase: "dependencies-installed",
    oldRevision: git(fixture.active, ["rev-parse", "HEAD"]).stdout.trim(),
    candidateRevision: candidate,
    hadActiveDependencies: true,
  })}\n`, "utf8");

  const checked = fixture.runUpdater(["--check"]);
  assert.equal(checked.status, 0, `${checked.stdout}\n${checked.stderr}`);
  assert.match(checked.stdout, /rolled back safely/);
  assert.equal((await readFile(join(fixture.active, "node_modules", "prepared.txt"), "utf8")).trim(), "prepared");
  assert.equal((await readFile(join(fixture.active, "version.txt"), "utf8")).trim(), "2");
  assert.equal(git(fixture.active, ["status", "--porcelain"]).stdout, "");

  await mkdir(join(fixture.seed, "user-data"));
  await writeFile(join(fixture.seed, "user-data", "must-not-deploy.txt"), "unsafe\n", "utf8");
  git(fixture.seed, ["add", "--force", "user-data/must-not-deploy.txt"]);
  git(fixture.seed, ["commit", "-m", "unsafe protected path"]);
  git(fixture.seed, ["push", "origin", "main"]);
  const protectedUpdate = fixture.runUpdater(["--skip-tests"]);
  assert.equal(protectedUpdate.status, 1);
  assert.match(protectedUpdate.stderr, /protected local-data paths/);
  assert.equal((await readFile(join(fixture.active, "version.txt"), "utf8")).trim(), "2");
});
