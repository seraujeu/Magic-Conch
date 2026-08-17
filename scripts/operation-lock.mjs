import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const INVALID_MARKER_GRACE_MS = 5 * 60 * 1000;

export function runtimeDirectory(projectRoot) {
  return join(projectRoot, ".runtime");
}

export function updateTransactionPath(projectRoot) {
  return join(runtimeDirectory(projectRoot), "update-transaction.json");
}

function updateLockPath(projectRoot) {
  return join(runtimeDirectory(projectRoot), "update.lock");
}

function runningDirectory(projectRoot) {
  return join(runtimeDirectory(projectRoot), "running");
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function markerIsActive(path) {
  try {
    const marker = JSON.parse(readFileSync(path, "utf8"));
    const pids = Array.isArray(marker.pids) ? marker.pids : [marker.pid];
    return pids.some(processIsAlive);
  } catch {
    try {
      return Date.now() - statSync(path).mtimeMs < INVALID_MARKER_GRACE_MS;
    } catch {
      return false;
    }
  }
}

function removeIfStale(path) {
  if (!existsSync(path)) return false;
  if (markerIsActive(path)) return true;
  try {
    unlinkSync(path);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return false;
}

function writeMarker(path, marker, flag) {
  writeFileSync(path, `${JSON.stringify(marker, null, 2)}\n`, { encoding: "utf8", flag });
}

function activeRunningMarkers(projectRoot) {
  const directory = runningDirectory(projectRoot);
  mkdirSync(directory, { recursive: true });
  const active = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const path = join(directory, entry.name);
    if (removeIfStale(path)) active.push(path);
  }
  return active;
}

export function acquireUpdateLock(projectRoot, { requireAppStopped = true } = {}) {
  mkdirSync(runtimeDirectory(projectRoot), { recursive: true });
  const path = updateLockPath(projectRoot);
  const marker = { pid: process.pid, pids: [process.pid], createdAt: new Date().toISOString() };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      writeMarker(path, marker, "wx");
      break;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      if (removeIfStale(path)) {
        throw new Error("Another Magic Conch update is already running.");
      }
      if (attempt === 1) throw new Error("Could not acquire the Magic Conch update lock.");
    }
  }

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    try {
      const current = JSON.parse(readFileSync(path, "utf8"));
      if (current.pid === process.pid) unlinkSync(path);
    } catch (error) {
      if (error?.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
    }
  };

  if (requireAppStopped && activeRunningMarkers(projectRoot).length > 0) {
    release();
    throw new Error("Magic Conch is running. Close its launcher window before updating.");
  }

  return { release };
}

export function registerRunningApp(projectRoot) {
  mkdirSync(runningDirectory(projectRoot), { recursive: true });
  const lockPath = updateLockPath(projectRoot);
  if (removeIfStale(lockPath)) {
    throw new Error("Magic Conch is being updated. Wait for the update to finish before launching.");
  }
  if (existsSync(updateTransactionPath(projectRoot))) {
    throw new Error("A previous update was interrupted. Run the updater once to recover before launching.");
  }

  const token = randomUUID();
  const path = join(runningDirectory(projectRoot), `${token}.json`);
  const pids = new Set([process.pid]);
  const save = (flag) => writeMarker(path, {
    pid: process.pid,
    pids: [...pids],
    createdAt: new Date().toISOString(),
  }, flag);
  save("wx");

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    try {
      unlinkSync(path);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  };
  const addPid = (pid) => {
    if (!Number.isInteger(pid) || pid < 1) return;
    pids.add(pid);
    const temporaryPath = `${path}.tmp`;
    writeMarker(temporaryPath, {
      pid: process.pid,
      pids: [...pids],
      createdAt: new Date().toISOString(),
    }, "w");
    renameSync(temporaryPath, path);
  };

  if (removeIfStale(lockPath) || existsSync(updateTransactionPath(projectRoot))) {
    release();
    throw new Error("Magic Conch started during an update. Wait for recovery to finish and try again.");
  }

  return { addPid, release };
}
