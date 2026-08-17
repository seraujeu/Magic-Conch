import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readlinkSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  acquireUpdateLock,
  runtimeDirectory,
  updateTransactionPath,
} from "./operation-lock.mjs";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const isWindows = process.platform === "win32";
const repositoryUrl = process.env.MAGIC_CONCH_REPOSITORY || "https://github.com/seraujeu/Magic-Conch.git";
const updateBranch = process.env.MAGIC_CONCH_BRANCH || "main";
const candidateRef = "refs/magic-conch/update-candidate";
const allowedArguments = new Set(["--help", "--check", "--skip-tests"]);
const transactionPhases = new Set(["prepared", "dependencies-backed-up", "dependencies-installed", "source-updated"]);
const bootstrapPhase = "deploying";

export function parseArguments(argv) {
  const unknown = argv.filter((argument) => !allowedArguments.has(argument));
  if (unknown.length > 0) {
    throw new Error(`Unknown update option${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}. Use --help for usage.`);
  }
  const args = new Set(argv);
  return {
    check: args.has("--check"),
    help: args.has("--help"),
    skipTests: args.has("--skip-tests"),
  };
}

function findGit() {
  const configuredGit = process.env.MAGIC_CONCH_GIT;
  const candidates = [configuredGit, "git"];
  if (isWindows) {
    for (const directory of [process.env.ProgramW6432, process.env.ProgramFiles, process.env["ProgramFiles(x86)"], process.env.LOCALAPPDATA]) {
      if (!directory) continue;
      candidates.push(
        directory === process.env.LOCALAPPDATA
          ? join(directory, "Programs", "Git", "cmd", "git.exe")
          : join(directory, "Git", "cmd", "git.exe"),
      );
    }
  }

  for (const candidate of [...new Set(candidates.filter(Boolean))]) {
    if (candidate !== "git" && !existsSync(candidate)) continue;
    const result = spawnSync(candidate, ["--version"], { cwd: projectRoot, encoding: "utf8", stdio: "pipe" });
    if (!result.error && result.status === 0) return candidate;
    if (candidate === configuredGit) {
      const detail = result.error?.message || result.stderr?.trim() || `exit status ${result.status}`;
      throw new Error(`MAGIC_CONCH_GIT could not be used: ${detail}`);
    }
  }

  throw new Error(
    isWindows
      ? "Git was not found. Install Git for Windows, then close and reopen this window. " +
        "If Git is installed in a custom location, set MAGIC_CONCH_GIT to the full path to git.exe."
      : "Git was not found. Install Git and run the updater again.",
  );
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd || projectRoot,
    encoding: "utf8",
    env: options.env || process.env,
    stdio: options.capture ? "pipe" : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    const detail = options.capture ? (result.stderr || result.stdout || "").trim() : "";
    throw new Error(`${command} ${commandArgs.join(" ")} failed${detail ? `: ${detail}` : "."}`);
  }
  return result;
}

function output(command, commandArgs, options = {}) {
  return run(command, commandArgs, { ...options, capture: true }).stdout.trim();
}

function gitRepositoryIsUsable(git) {
  const result = run(git, ["rev-parse", "--show-toplevel"], {
    capture: true,
    allowFailure: true,
  });
  const reportedRoot = (result.stdout || "").trim();
  const expectedRoot = resolve(projectRoot);
  const actualRoot = reportedRoot ? resolve(reportedRoot) : "";
  const rootsMatch = isWindows
    ? actualRoot.toLowerCase() === expectedRoot.toLowerCase()
    : actualRoot === expectedRoot;

  return result.status === 0 && rootsMatch;
}

function verifyGitRepository(git) {
  if (!gitRepositoryIsUsable(git)) {
    throw new Error(
      "This folder is not a usable Git clone. Its .git metadata is missing, incomplete, or belongs to another folder. " +
      "Clone the repository into a new folder, or download a fresh copy instead of using the updater.",
    );
  }
}

function sanitizedNpmEnvironment() {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    const normalized = key.toLowerCase();
    if (normalized === "init_cwd" || normalized === "npm_config_local_prefix" || normalized.startsWith("npm_package_")) {
      delete environment[key];
    }
  }
  return environment;
}

function runNpm(npmArgs, cwd) {
  const options = { cwd, env: sanitizedNpmEnvironment() };
  if (isWindows) {
    run(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "npm.cmd", ...npmArgs], options);
  } else {
    run("npm", npmArgs, options);
  }
}

function assertInsideRuntime(path) {
  const root = runtimeDirectory(projectRoot);
  const child = relative(root, path);
  if (!child || child.startsWith("..") || isAbsolute(child)) {
    throw new Error(`Refusing to modify an unsafe update path: ${path}`);
  }
}

function safeRemoveRuntimePath(path) {
  assertInsideRuntime(path);
  rmSync(path, { recursive: true, force: true });
}

function transactionPaths(token) {
  if (!/^[0-9a-f-]{36}$/i.test(token)) throw new Error("The saved update transaction has an invalid identifier.");
  const runtimeRoot = runtimeDirectory(projectRoot);
  return {
    backupDependencies: join(runtimeRoot, `update-node-modules-${token}`),
    stagingRoot: join(runtimeRoot, `update-staging-${token}`),
  };
}

function saveTransaction(state) {
  mkdirSync(runtimeDirectory(projectRoot), { recursive: true });
  const path = updateTransactionPath(projectRoot);
  const temporaryPath = `${path}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  renameSync(temporaryPath, path);
}

function readSavedTransaction() {
  const path = updateTransactionPath(projectRoot);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`The update recovery file is damaged: ${path}`);
  }
}

function readGitTransaction() {
  const path = updateTransactionPath(projectRoot);
  const state = readSavedTransaction();
  if (!state) return null;
  if (
    state?.version !== 1 ||
    (state.mode && state.mode !== "git") ||
    !transactionPhases.has(state.phase) ||
    !/^[0-9a-f]{40,64}$/i.test(state.oldRevision || "") ||
    !/^[0-9a-f]{40,64}$/i.test(state.candidateRevision || "") ||
    typeof state.hadActiveDependencies !== "boolean"
  ) {
    throw new Error(`The update recovery file is invalid: ${path}`);
  }
  transactionPaths(state.token);
  return state;
}

function cleanupWorktree(git, stagingRoot) {
  assertInsideRuntime(stagingRoot);
  run(git, ["worktree", "remove", "--force", stagingRoot], { capture: true, allowFailure: true });
  if (existsSync(stagingRoot)) safeRemoveRuntimePath(stagingRoot);
  run(git, ["worktree", "prune"], { capture: true, allowFailure: true });
}

function recoverInterruptedUpdate(git) {
  const state = readGitTransaction();
  if (!state) return false;

  console.log("Recovering an interrupted Magic Conch update...");
  const { backupDependencies, stagingRoot } = transactionPaths(state.token);
  const activeDependencies = join(projectRoot, "node_modules");
  const stagedDependencies = join(stagingRoot, "node_modules");
  const head = output(git, ["rev-parse", "HEAD"]);

  if (head === state.candidateRevision) {
    if (!existsSync(activeDependencies) && existsSync(stagedDependencies)) {
      renameSync(stagedDependencies, activeDependencies);
    }
    if (!existsSync(activeDependencies)) {
      throw new Error(
        "The update changed the source but its prepared dependencies are missing. " +
        "Run install.bat, then run the updater again to finish recovery.",
      );
    }
    if (existsSync(backupDependencies)) safeRemoveRuntimePath(backupDependencies);
    cleanupWorktree(git, stagingRoot);
    unlinkSync(updateTransactionPath(projectRoot));
    console.log("The previously interrupted update was completed.");
    return true;
  }

  if (head !== state.oldRevision) {
    throw new Error("The source changed during an interrupted update. Recovery stopped to protect local work.");
  }

  if (existsSync(backupDependencies)) {
    if (existsSync(activeDependencies)) rmSync(activeDependencies, { recursive: true, force: true });
    renameSync(backupDependencies, activeDependencies);
  } else if (!state.hadActiveDependencies && !existsSync(stagedDependencies) && existsSync(activeDependencies)) {
    rmSync(activeDependencies, { recursive: true, force: true });
  }
  cleanupWorktree(git, stagingRoot);
  unlinkSync(updateTransactionPath(projectRoot));
  console.log("The interrupted update was rolled back safely.");
  return true;
}

function verifyProtectedPaths(git, candidateRevision, cwd = projectRoot) {
  const tracked = output(git, [
    "ls-tree", "-r", "--name-only", candidateRevision, "--",
    ".runtime", "node_modules", "user-data", "chats", "workflows", "backups", "exports", "plugins",
  ], { cwd }).split(/\r?\n/).filter(Boolean);
  const unsafe = tracked.filter((path) => path !== "plugins/README.md");
  if (unsafe.length > 0) {
    throw new Error(`The update contains files in protected local-data paths: ${unsafe.slice(0, 5).join(", ")}.`);
  }
}

function verifyProtectedPathsRemainIgnored(git, stagingRoot) {
  const probes = [
    ".runtime/update-probe", "node_modules/update-probe", "user-data/update-probe",
    "chats/update-probe", "workflows/update-probe", "backups/update-probe",
    "exports/update-probe", "plugins/local-update-probe",
  ];
  for (const probe of probes) {
    const result = run(git, ["check-ignore", "--quiet", probe], {
      cwd: stagingRoot,
      capture: true,
      allowFailure: true,
    });
    if (result.status !== 0) {
      throw new Error(`The update no longer ignores the protected local-data path ${probe}.`);
    }
  }
}

function prepareUpdate(git, candidateRevision, { skipTests }) {
  const token = randomUUID();
  const { stagingRoot } = transactionPaths(token);
  console.log("Preparing the update in an isolated worktree...");
  run(git, ["worktree", "add", "--detach", stagingRoot, candidateRevision]);
  try {
    verifyProtectedPathsRemainIgnored(git, stagingRoot);
    runNpm(["ci"], stagingRoot);
    if (!existsSync(join(stagingRoot, "node_modules"))) {
      throw new Error("Dependency installation completed without creating node_modules.");
    }
    if (!skipTests) {
      console.log("Verifying the prepared update...");
      runNpm(["test"], stagingRoot);
    }
    return { stagingRoot, token };
  } catch (error) {
    cleanupWorktree(git, stagingRoot);
    throw error;
  }
}

function deployPreparedUpdate(git, oldRevision, candidateRevision, prepared) {
  const activeDependencies = join(projectRoot, "node_modules");
  const stagedDependencies = join(prepared.stagingRoot, "node_modules");
  const { backupDependencies } = transactionPaths(prepared.token);
  const state = {
    version: 1,
    mode: "git",
    token: prepared.token,
    phase: "prepared",
    oldRevision,
    candidateRevision,
    hadActiveDependencies: existsSync(activeDependencies),
  };
  saveTransaction(state);

  try {
    if (state.hadActiveDependencies) renameSync(activeDependencies, backupDependencies);
    state.phase = "dependencies-backed-up";
    saveTransaction(state);

    renameSync(stagedDependencies, activeDependencies);
    state.phase = "dependencies-installed";
    saveTransaction(state);

    run(git, ["merge", "--ff-only", candidateRevision]);
    state.phase = "source-updated";
    saveTransaction(state);

    if (existsSync(backupDependencies)) safeRemoveRuntimePath(backupDependencies);
    unlinkSync(updateTransactionPath(projectRoot));
  } catch (error) {
    try {
      recoverInterruptedUpdate(git);
    } catch (recoveryError) {
      throw new Error(`${error.message} Automatic recovery also failed: ${recoveryError.message}`);
    }
    throw error;
  }
}

function normalizeRepositoryPath(path) {
  const normalized = String(path || "").replaceAll("\\", "/");
  const segments = normalized.split("/");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    isAbsolute(normalized) ||
    segments.some((segment) => !segment || segment === "." || segment === "..") ||
    segments[0].toLowerCase() === ".runtime"
  ) {
    throw new Error(`Refusing to modify an unsafe installation path: ${path}`);
  }
  return normalized;
}

function activeInstallationPath(repositoryPath) {
  const normalized = normalizeRepositoryPath(repositoryPath);
  const path = join(projectRoot, ...normalized.split("/"));
  const child = relative(projectRoot, path);
  if (!child || child.startsWith("..") || isAbsolute(child)) {
    throw new Error(`Refusing to modify an unsafe installation path: ${repositoryPath}`);
  }
  return path;
}

function pathExists(path) {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function bootstrapPaths(token) {
  if (!/^[0-9a-f-]{36}$/i.test(token)) throw new Error("The ZIP migration has an invalid identifier.");
  const root = runtimeDirectory(projectRoot);
  return {
    backupRoot: join(root, `zip-install-backup-${token}`),
    stagingRoot: join(root, `zip-install-staging-${token}`),
  };
}

function bootstrapBackupPath(backupRoot, category, repositoryPath) {
  assertInsideRuntime(backupRoot);
  const normalized = normalizeRepositoryPath(repositoryPath);
  const path = join(backupRoot, category, ...normalized.split("/"));
  assertInsideRuntime(path);
  return path;
}

function validateBootstrapTransaction(state) {
  const path = updateTransactionPath(projectRoot);
  if (
    state?.version !== 1 ||
    state.mode !== "bootstrap" ||
    state.phase !== bootstrapPhase ||
    !/^[0-9a-f]{40,64}$/i.test(state.candidateRevision || "") ||
    !Array.isArray(state.appliedPaths) ||
    !Array.isArray(state.movedUntrackedPaths) ||
    !state.appliedPaths.every((entry) => typeof entry === "string") ||
    !state.movedUntrackedPaths.every((entry) => typeof entry === "string") ||
    (state.pendingPath !== null && typeof state.pendingPath !== "string") ||
    (state.pendingUntrackedPath !== null && typeof state.pendingUntrackedPath !== "string")
  ) {
    throw new Error(`The ZIP migration recovery file is invalid: ${path}`);
  }
  bootstrapPaths(state.token);
  for (const entry of [
    ...state.appliedPaths,
    ...state.movedUntrackedPaths,
    state.pendingPath,
    state.pendingUntrackedPath,
  ].filter(Boolean)) normalizeRepositoryPath(entry);
  return state;
}

function copyCandidateEntry(source, destination) {
  const sourceStat = lstatSync(source);
  mkdirSync(dirname(destination), { recursive: true });
  if (sourceStat.isSymbolicLink()) {
    symlinkSync(readlinkSync(source), destination, isWindows ? undefined : sourceStat.isDirectory() ? "dir" : "file");
    return;
  }
  if (!sourceStat.isFile()) throw new Error(`The update contains an unsupported tracked entry: ${source}`);
  copyFileSync(source, destination);
  if (!isWindows) chmodSync(destination, sourceStat.mode);
}

function applyBootstrapPath(state, repositoryPath, install) {
  const normalized = normalizeRepositoryPath(repositoryPath);
  const { backupRoot } = bootstrapPaths(state.token);
  const activePath = activeInstallationPath(normalized);
  const backupPath = bootstrapBackupPath(backupRoot, "replaced", normalized);
  state.pendingPath = normalized;
  saveTransaction(state);

  if (pathExists(activePath)) {
    mkdirSync(dirname(backupPath), { recursive: true });
    renameSync(activePath, backupPath);
  }
  install(activePath);
  state.appliedPaths.push(normalized);
  state.pendingPath = null;
  saveTransaction(state);
}

function moveBootstrapUntrackedPath(state, repositoryPath) {
  const normalized = normalizeRepositoryPath(repositoryPath);
  const { backupRoot } = bootstrapPaths(state.token);
  const activePath = activeInstallationPath(normalized);
  const backupPath = bootstrapBackupPath(backupRoot, "untracked", normalized);
  if (!pathExists(activePath)) return;
  state.pendingUntrackedPath = normalized;
  saveTransaction(state);
  mkdirSync(dirname(backupPath), { recursive: true });
  renameSync(activePath, backupPath);
  state.movedUntrackedPaths.push(normalized);
  state.pendingUntrackedPath = null;
  saveTransaction(state);
}

function uniqueReverse(values) {
  return [...new Set(values.filter(Boolean))].reverse();
}

function rollbackBootstrapTransaction() {
  const rawState = readSavedTransaction();
  if (!rawState || rawState.mode !== "bootstrap") return false;
  const state = validateBootstrapTransaction(rawState);
  const { backupRoot, stagingRoot } = bootstrapPaths(state.token);
  console.log("Rolling back an interrupted ZIP-install update...");

  for (const repositoryPath of uniqueReverse([...state.movedUntrackedPaths, state.pendingUntrackedPath])) {
    const activePath = activeInstallationPath(repositoryPath);
    const backupPath = bootstrapBackupPath(backupRoot, "untracked", repositoryPath);
    if (!pathExists(backupPath)) continue;
    if (pathExists(activePath)) {
      throw new Error(`Recovery found a new file at ${repositoryPath}; move it aside and run the updater again.`);
    }
    mkdirSync(dirname(activePath), { recursive: true });
    renameSync(backupPath, activePath);
  }

  for (const repositoryPath of uniqueReverse([...state.appliedPaths, state.pendingPath])) {
    const activePath = activeInstallationPath(repositoryPath);
    const backupPath = bootstrapBackupPath(backupRoot, "replaced", repositoryPath);
    if (pathExists(activePath)) rmSync(activePath, { recursive: true, force: true });
    if (pathExists(backupPath)) {
      mkdirSync(dirname(activePath), { recursive: true });
      renameSync(backupPath, activePath);
    }
  }

  if (existsSync(stagingRoot)) safeRemoveRuntimePath(stagingRoot);
  if (existsSync(backupRoot)) safeRemoveRuntimePath(backupRoot);
  unlinkSync(updateTransactionPath(projectRoot));
  console.log("The interrupted ZIP-install update was rolled back safely.");
  return true;
}

function prepareBootstrapClone(git, { skipTests }) {
  const token = randomUUID();
  const { stagingRoot } = bootstrapPaths(token);
  console.log("Preparing a Git-managed installation in staging...");
  run(git, [
    "clone", "--branch", updateBranch, "--single-branch", "--no-tags",
    repositoryUrl, stagingRoot,
  ]);
  try {
    const candidateRevision = output(git, ["rev-parse", "HEAD"], { cwd: stagingRoot });
    verifyProtectedPaths(git, candidateRevision, stagingRoot);
    verifyProtectedPathsRemainIgnored(git, stagingRoot);
    runNpm(["ci"], stagingRoot);
    if (!existsSync(join(stagingRoot, "node_modules"))) {
      throw new Error("Dependency installation completed without creating node_modules.");
    }
    if (!skipTests) {
      console.log("Verifying the prepared Git-managed installation...");
      runNpm(["test"], stagingRoot);
    }
    return { candidateRevision, stagingRoot, token };
  } catch (error) {
    safeRemoveRuntimePath(stagingRoot);
    throw error;
  }
}

function requiredCandidateDirectories(candidateFiles) {
  const directories = new Set();
  for (const candidateFile of candidateFiles) {
    const segments = normalizeRepositoryPath(candidateFile).split("/");
    for (let index = 1; index < segments.length; index += 1) {
      directories.add(segments.slice(0, index).join("/"));
    }
  }
  return [...directories].sort((left, right) => left.split("/").length - right.split("/").length);
}

function parseUntrackedPaths(status) {
  const untracked = [];
  for (const entry of status.split("\0").filter(Boolean)) {
    const code = entry.slice(0, 2);
    const repositoryPath = entry.slice(3);
    if (code === "??") {
      untracked.push(normalizeRepositoryPath(repositoryPath));
      continue;
    }
    throw new Error(`The migrated Git installation is unexpectedly dirty: ${entry}`);
  }
  return untracked;
}

function deployBootstrapClone(git, prepared) {
  const { backupRoot, stagingRoot } = bootstrapPaths(prepared.token);
  const candidateFiles = output(git, ["ls-files", "-z"], { cwd: stagingRoot })
    .split("\0")
    .filter(Boolean)
    .map(normalizeRepositoryPath);
  const state = {
    version: 1,
    mode: "bootstrap",
    token: prepared.token,
    phase: bootstrapPhase,
    candidateRevision: prepared.candidateRevision,
    appliedPaths: [],
    movedUntrackedPaths: [],
    pendingPath: null,
    pendingUntrackedPath: null,
  };
  saveTransaction(state);
  let committed = false;

  try {
    for (const directoryPath of requiredCandidateDirectories(candidateFiles)) {
      const activePath = activeInstallationPath(directoryPath);
      if (!pathExists(activePath)) {
        applyBootstrapPath(state, directoryPath, (destination) => mkdirSync(destination));
      } else if (!lstatSync(activePath).isDirectory()) {
        applyBootstrapPath(state, directoryPath, (destination) => mkdirSync(destination));
      }
    }

    for (const candidateFile of candidateFiles) {
      const source = join(stagingRoot, ...candidateFile.split("/"));
      applyBootstrapPath(state, candidateFile, (destination) => copyCandidateEntry(source, destination));
    }

    applyBootstrapPath(state, "node_modules", (destination) => {
      renameSync(join(stagingRoot, "node_modules"), destination);
    });
    applyBootstrapPath(state, ".git", (destination) => {
      renameSync(join(stagingRoot, ".git"), destination);
    });

    verifyGitRepository(git);
    const untracked = parseUntrackedPaths(output(git, [
      "status", "--porcelain=v1", "-z", "--untracked-files=all",
    ]));
    for (const repositoryPath of untracked) moveBootstrapUntrackedPath(state, repositoryPath);
    const remainingStatus = output(git, ["status", "--porcelain", "--untracked-files=all"]);
    if (remainingStatus) throw new Error(`The migrated installation is not clean: ${remainingStatus}`);

    unlinkSync(updateTransactionPath(projectRoot));
    committed = true;
  } catch (error) {
    try {
      rollbackBootstrapTransaction();
    } catch (recoveryError) {
      throw new Error(`${error.message} Automatic ZIP migration rollback also failed: ${recoveryError.message}`);
    }
    throw error;
  }

  if (committed) {
    const oldDependencies = bootstrapBackupPath(backupRoot, "replaced", "node_modules");
    try {
      if (existsSync(oldDependencies)) safeRemoveRuntimePath(oldDependencies);
      if (existsSync(stagingRoot)) safeRemoveRuntimePath(stagingRoot);
      writeFileSync(join(backupRoot, "README.txt"), [
        "Magic Conch ZIP-install migration backup",
        "",
        "Files replaced or not recognized during migration are retained here.",
        "Delete this directory after confirming the migrated installation works.",
        "",
      ].join("\n"), "utf8");
    } catch (cleanupError) {
      console.warn(`The migration succeeded, but temporary-file cleanup was incomplete: ${cleanupError.message}`);
    }
    return backupRoot;
  }

  throw new Error("The ZIP-install migration ended without committing or rolling back.");
}

function checkBootstrapSource(git) {
  const result = output(git, ["ls-remote", "--exit-code", repositoryUrl, `refs/heads/${updateBranch}`]);
  const revision = result.split(/\s+/)[0];
  if (!/^[0-9a-f]{40,64}$/i.test(revision || "")) {
    throw new Error(`Could not resolve ${updateBranch} from ${repositoryUrl}.`);
  }
  console.log(`This ZIP installation has no revision history to compare. The latest ${updateBranch} revision is ${revision.slice(0, 12)}.`);
  console.log("No working-tree files were changed. Run the updater without --check to migrate and update it.");
}

function bootstrapZipInstallation(git, options) {
  if (options.check) {
    checkBootstrapSource(git);
    return;
  }
  const prepared = prepareBootstrapClone(git, options);
  const backupRoot = deployBootstrapClone(git, prepared);
  console.log("The ZIP installation was migrated to a Git-managed installation and updated successfully.");
  console.log(`Replaced or unrecognized old program files were backed up at ${backupRoot}`);
  console.log("Ignored personal data and local configuration were left in place.");
}

function cleanWorkingTree(git) {
  return output(git, ["status", "--porcelain", "--untracked-files=all"]);
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.help) {
    console.log("Usage: npm run update -- [--check] [--skip-tests]");
    return;
  }

  const git = findGit();
  const branchCheck = run(git, ["check-ref-format", "--branch", updateBranch], { capture: true, allowFailure: true });
  if (branchCheck.status !== 0) throw new Error(`The update branch name is invalid: ${updateBranch}.`);
  const savedTransaction = readSavedTransaction();
  const needsRecovery = Boolean(savedTransaction);
  const lock = acquireUpdateLock(projectRoot, { requireAppStopped: !options.check || needsRecovery });
  let prepared = null;
  try {
    if (savedTransaction?.mode === "bootstrap") rollbackBootstrapTransaction();

    const usableRepository = gitRepositoryIsUsable(git);
    if (!usableRepository) {
      if (savedTransaction && savedTransaction.mode !== "bootstrap") {
        throw new Error("A Git update recovery record exists, but this folder no longer has usable Git metadata.");
      }
      bootstrapZipInstallation(git, options);
      return;
    }

    verifyGitRepository(git);
    recoverInterruptedUpdate(git);
    const dirty = cleanWorkingTree(git);
    if (dirty) {
      throw new Error("The program has local source changes. Commit or remove them before updating; no files were changed.");
    }

    const branch = output(git, ["branch", "--show-current"]);
    if (!branch) throw new Error("Updates require a checked-out Git branch.");
    if (branch !== updateBranch) {
      throw new Error(`Updates must be run from the ${updateBranch} branch; the current branch is ${branch}.`);
    }
    console.log(`Checking ${repositoryUrl} for updates to ${updateBranch}...`);
    run(git, [
      "fetch", "--no-tags", repositoryUrl,
      `+refs/heads/${updateBranch}:${candidateRef}`,
    ]);
    const oldRevision = output(git, ["rev-parse", "HEAD"]);
    const candidateRevision = output(git, ["rev-parse", "--verify", `${candidateRef}^{commit}`]);
    if (oldRevision === candidateRevision) {
      console.log("Magic Conch is already up to date.");
      return;
    }

    const fastForward = run(git, ["merge-base", "--is-ancestor", oldRevision, candidateRevision], {
      capture: true,
      allowFailure: true,
    });
    if (fastForward.status !== 0) {
      throw new Error("The local and GitHub branches have diverged. Update was stopped to protect local work.");
    }
    verifyProtectedPaths(git, candidateRevision);

    if (options.check) {
      const count = output(git, ["rev-list", "--count", `${oldRevision}..${candidateRevision}`]);
      console.log(`${count} update commit(s) are available. No working-tree files were changed.`);
      return;
    }

    prepared = prepareUpdate(git, candidateRevision, options);
    if (output(git, ["rev-parse", "HEAD"]) !== oldRevision || cleanWorkingTree(git)) {
      throw new Error("The source changed while the update was being prepared. No update was applied.");
    }
    deployPreparedUpdate(git, oldRevision, candidateRevision, prepared);

    console.log("Magic Conch is updated. The prepared dependencies and tests succeeded before the live source changed.");
    console.log("Continue launching it on the same localhost port to access the same browser data.");
  } finally {
    try {
      if (prepared) cleanupWorktree(git, prepared.stagingRoot);
    } finally {
      try {
        run(git, ["update-ref", "-d", candidateRef], { capture: true, allowFailure: true });
      } finally {
        lock.release();
      }
    }
  }
}

const directPath = process.argv[1] ? resolve(process.argv[1]) : "";
const modulePath = resolve(fileURLToPath(import.meta.url));
const launchedDirectly = isWindows
  ? directPath.toLowerCase() === modulePath.toLowerCase()
  : directPath === modulePath;

if (launchedDirectly) {
  try {
    main();
  } catch (error) {
    console.error(`Update stopped: ${error.message}`);
    process.exitCode = 1;
  }
}
