import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const isWindows = process.platform === "win32";

function npmCommand(args) {
  return isWindows
    ? { command: process.env.ComSpec || "cmd.exe", args: ["/d", "/s", "/c", "npm.cmd", ...args] }
    : { command: "npm", args };
}

function ensureSupportedNode() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 13)) {
    throw new Error(`Node.js 22.13 or newer is required (found ${process.versions.node}).`);
  }
}

function requestedPort() {
  const raw = process.argv[2] || process.env.MAGIC_CONCH_PORT || process.env.PORT || "4173";
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("The port must be a number from 1 to 65535.");
  }
  return port;
}

function portIsAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen({ host: "127.0.0.1", port, exclusive: true }, () => {
      server.close(() => resolve(true));
    });
  });
}

async function availablePort(port) {
  if (await portIsAvailable(port)) return port;
  throw new Error(
    `Port ${port} is already in use. Stop the other program or deliberately choose another port. ` +
    "Changing ports uses a different browser-data area.",
  );
}

function installDependenciesIfNeeded() {
  const executable = join(projectRoot, "node_modules", ".bin", isWindows ? "vinext.cmd" : "vinext");
  if (existsSync(executable)) return;

  console.log("Installing Magic Conch for first use...");
  const npm = npmCommand(["install"]);
  const result = spawnSync(npm.command, npm.args, { cwd: projectRoot, stdio: "inherit" });
  if (result.status !== 0) throw new Error("Dependency installation failed.");
}

function openBrowser(url) {
  let command;
  let args;
  if (isWindows) {
    command = process.env.ComSpec || "cmd.exe";
    args = ["/d", "/s", "/c", "start", "", url];
  } else if (process.platform === "darwin") {
    command = "open";
    args = [url];
  } else {
    command = "xdg-open";
    args = [url];
  }

  const opener = spawn(command, args, { detached: true, stdio: "ignore" });
  opener.on("error", () => {
    console.log(`Open ${url} in your browser.`);
  });
  opener.unref();
}

async function openWhenReady(url, processState) {
  for (let attempt = 0; attempt < 120 && processState.running; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.ok) {
        openBrowser(url);
        return;
      }
    } catch {
      // The development server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

async function main() {
  ensureSupportedNode();
  installDependenciesIfNeeded();

  const port = await availablePort(requestedPort());
  const url = `http://localhost:${port}/`;
  console.log(`Starting Magic Conch at ${url}`);
  console.log("Keep this window open; press Ctrl+C to stop.");

  const npm = npmCommand(["run", "dev", "--", "--port", String(port), "--strictPort"]);
  const child = spawn(npm.command, npm.args, { cwd: projectRoot, stdio: "inherit" });
  const processState = { running: true };
  void openWhenReady(url, processState);

  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
  processState.running = false;
  process.exitCode = exitCode;
}

main().catch((error) => {
  console.error(`Magic Conch could not start: ${error.message}`);
  process.exitCode = 1;
});
