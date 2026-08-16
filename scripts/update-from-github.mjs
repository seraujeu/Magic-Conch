import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const isWindows = process.platform === "win32";
const args = new Set(process.argv.slice(2));
const repositoryUrl = process.env.MAGIC_CONCH_REPOSITORY || "https://github.com/seraujeu/Magic-Conch.git";
const updateBranch = process.env.MAGIC_CONCH_BRANCH || "main";

function findGit() {
  const candidates = [process.env.MAGIC_CONCH_GIT, "git"];
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

  if (!existsSync(join(projectRoot, ".git"))) {
    throw new Error(
      "This folder is not a Git clone, so it cannot update itself. " +
      "Download a fresh copy or clone the repository with Git.",
    );
  }

  const git = findGit();
  const dirty = output(git, ["status", "--porcelain", "--untracked-files=all"]);
  if (dirty) {
    throw new Error("The program has local source changes. Commit or remove them before updating; no files were changed.");
  }

  const branch = output(git, ["branch", "--show-current"]);
  if (!branch) throw new Error("Updates require a checked-out Git branch.");
  if (branch !== updateBranch) {
    throw new Error(`Updates must be run from the ${updateBranch} branch; the current branch is ${branch}.`);
  }

  console.log(`Checking ${repositoryUrl} for updates to ${updateBranch}...`);
  run(git, ["fetch", "--no-tags", repositoryUrl, updateBranch]);
  const remoteBranch = "FETCH_HEAD";
  run(git, ["rev-parse", "--verify", remoteBranch], { capture: true });

  const localRevision = output(git, ["rev-parse", "HEAD"]);
  const remoteRevision = output(git, ["rev-parse", remoteBranch]);
  if (localRevision === remoteRevision) {
    console.log("Magic Conch is already up to date.");
    return;
  }

  const fastForward = run(git, ["merge-base", "--is-ancestor", "HEAD", remoteBranch], {
    capture: true,
    allowFailure: true,
  });
  if (fastForward.status !== 0) {
    throw new Error("The local and GitHub branches have diverged. Update was stopped to protect local work.");
  }

  if (args.has("--check")) {
    const count = output(git, ["rev-list", "--count", `HEAD..${remoteBranch}`]);
    console.log(`${count} update commit(s) are available. No files were changed.`);
    return;
  }

  run(git, ["merge", "--ff-only", remoteBranch]);
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
