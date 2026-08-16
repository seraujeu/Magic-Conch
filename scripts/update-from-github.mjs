import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const isWindows = process.platform === "win32";
const args = new Set(process.argv.slice(2));
const repositoryUrl = process.env.MAGIC_CONCH_REPOSITORY || "https://github.com/seraujeu/Magic-Conch.git";
const updateBranch = process.env.MAGIC_CONCH_BRANCH || "main";

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    const detail = options.capture ? (result.stderr || result.stdout || "").trim() : "";
    throw new Error(`${command} ${commandArgs.join(" ")} failed${detail ? `: ${detail}` : "."}`);
  }
  return result;
}

function output(command, commandArgs) {
  return run(command, commandArgs, { capture: true }).stdout.trim();
}

function runNpm(npmArgs) {
  if (isWindows) {
    run(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "npm.cmd", ...npmArgs]);
  } else {
    run("npm", npmArgs);
  }
}

function main() {
  if (args.has("--help")) {
    console.log("Usage: npm run update -- [--check] [--skip-tests]");
    return;
  }

  run("git", ["--version"], { capture: true });
  const dirty = output("git", ["status", "--porcelain", "--untracked-files=all"]);
  if (dirty) {
    throw new Error("The program has local source changes. Commit or remove them before updating; no files were changed.");
  }

  const branch = output("git", ["branch", "--show-current"]);
  if (!branch) throw new Error("Updates require a checked-out Git branch.");
  if (branch !== updateBranch) {
    throw new Error(`Updates must be run from the ${updateBranch} branch; the current branch is ${branch}.`);
  }

  console.log(`Checking ${repositoryUrl} for updates to ${updateBranch}...`);
  run("git", ["fetch", "--no-tags", repositoryUrl, updateBranch]);
  const remoteBranch = "FETCH_HEAD";
  run("git", ["rev-parse", "--verify", remoteBranch], { capture: true });

  const localRevision = output("git", ["rev-parse", "HEAD"]);
  const remoteRevision = output("git", ["rev-parse", remoteBranch]);
  if (localRevision === remoteRevision) {
    console.log("Magic Conch is already up to date.");
    return;
  }

  const fastForward = run("git", ["merge-base", "--is-ancestor", "HEAD", remoteBranch], {
    capture: true,
    allowFailure: true,
  });
  if (fastForward.status !== 0) {
    throw new Error("The local and GitHub branches have diverged. Update was stopped to protect local work.");
  }

  if (args.has("--check")) {
    const count = output("git", ["rev-list", "--count", `HEAD..${remoteBranch}`]);
    console.log(`${count} update commit(s) are available. No files were changed.`);
    return;
  }

  run("git", ["merge", "--ff-only", remoteBranch]);
  console.log("Refreshing program dependencies...");
  runNpm(["ci"]);

  if (!args.has("--skip-tests")) {
    console.log("Verifying the updated program...");
    runNpm(["test"]);
  }

  console.log("Magic Conch is updated. Chats, workflows, settings, and installed plug-ins were not touched.");
  console.log("Continue launching it on the same localhost port to access the same browser data.");
}

try {
  main();
} catch (error) {
  console.error(`Update stopped: ${error.message}`);
  process.exitCode = 1;
}
