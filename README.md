# Magic Conch

Magic Conch is a local-first visual AI workflow studio with a chat interface.
It runs as a local web application and stores personal state on your device.

## Supported systems

- Windows 10/11
- macOS
- Linux distributions that support Node.js 22
- Node.js `>=22.13.0` and npm
- A current Chromium browser is recommended

The editor, chat, AI providers, workflow import/export, and browser-backed
storage are portable across the supported operating systems. Workflows can be
transferred as JSON, or as ZIP bundles containing `workflow.json`, dependencies,
and snapshots of files read by Load nodes. Save, Load, and Load Directory nodes use the local application
service with persistent relative or absolute paths; they do not require browser
folder permission. The optional workflow-folder picker uses the File System
Access API in Chrome and Edge. Workflow JSON and ZIP import/export remain
available without that picker.

## Install and launch

Clone or download the repository, then use the launcher for your system:

- Windows: double-click `install.bat` once, then `Launch Magic Conch.bat`
- macOS/Linux: run `sh install.sh` once, then `sh "Launch Magic Conch.sh"`
- Any system: run `npm install`, followed by `npm run launch`

On Windows, `install.bat` automatically downloads a verified, private Node.js
runtime when a supported system installation is unavailable. On macOS and
Linux, `sh install.sh` does the same. The runtime is stored in `.runtime/`
beside the application and does not require administrator access or change the
system-wide Node.js installation.

The launcher installs dependencies when needed, uses the stable default port
4173, starts Magic Conch, and opens it in the default browser. It stops with a
clear message if that port is occupied so it does not silently switch to a
different browser-data area. It also refuses to start while an update or update
recovery is active. To deliberately use another port, pass it to the launcher,
for example:

```bash
npm run launch -- 4173
```

Keep using the same URL (especially the same port) to see the same local data.
Browser storage is isolated by URL, browser profile, and device.

## Personal data and privacy

Magic Conch keeps these items outside the source repository:

- chat sessions, workflows, installed plug-ins, and imported ZIP snapshots (IndexedDB)
- chat folders and provider settings/keys (local storage)
- an optional remembered workflow-folder handle (IndexedDB)
- Save/Load node output (`user-data/` by default)

When a Save, Load, or Load Directory node has no directory path, it uses the
`user-data/` folder beside the program files. Change the shared path under
**Settings → General → Default folders**; relative paths start at the program
folder, and absolute paths are supported by the locally launched app. Each node
can provide its own persistent path without a browser picker or permission prompt.

Updating source files does not clear those stores. Personal data is not moved
to another computer automatically. Use **Export JSON** for a single manifest,
or **Export with files** for a self-contained ZIP. The ZIP includes separate
copies of every transitively called workflow and the installed plug-ins used by
those workflows together with their bundled files. It also reads the current results of Load and Load
Directory nodes—including folder-mode Load nodes—and packages their values and
files as runtime snapshots. Files captured by different Load nodes are kept in
separate ZIP directories, and recursive folder loads retain their relative
subfolder layout. The local application reads configured paths without browser
permission prompts. Importing the ZIP restores those packaged dependencies, remaps
called-workflow references to their newly imported copies, and writes bundled
Load snapshots beneath `user-data/workflow-files/<workflow>/<load-node>/` while
preserving their relative paths. Each imported Load or Load Directory node is
rewritten to that persistent directory, so the files are loaded from `user-data/`
when the workflow runs and the original directories are no longer required.
Each Load node receives a separate directory, so files captured from different
source directories never overwrite or mix with one another. **All files in
folder** loads retain their nested relative paths and continue loading as a
folder rather than as a saved record.

Conventional local folders such as `chats/`, `workflows/`, `user-data/`,
`backups/`, `exports/`, and local contents of `plugins/` are ignored by Git.
Consequently, files inside `user-data/` are excluded from GitHub uploads and
remain untouched by the GitHub updater.

## Update safely from GitHub

From a Git clone:

- Windows: double-click `Update Magic Conch.bat`
- macOS/Linux: run `sh "Update Magic Conch.sh"`
- Any system: run `npm run update`

The updater requires Git to be installed. On Windows, it also checks the
standard Git for Windows install locations when Git is not on `PATH`. A folder
downloaded as a ZIP, copied without its complete hidden `.git/` directory, or
copied from a linked Git worktree is migrated automatically on its first
update. The updater prepares and verifies a fresh clone, installs its ordinary
`.git/` metadata, and uses the normal fast-forward update path afterward.

During that first ZIP migration, ignored personal data and configuration remain
in place. Official program files are replaced by the verified clone. Previous
versions of replaced files and non-ignored files that the new repository does
not recognize are retained under `.runtime/zip-install-backup-<id>/`; delete
that backup only after confirming the migrated installation works. Because a
ZIP has no revision history, `--check` can report the latest available revision
but cannot determine how many updates separate it from the installed copy.

Close every running Magic Conch launcher before updating. The updater uses an
exclusive lock, fetches the requested branch into a private Git ref, and only
accepts a fast-forward update on a clean source tree. It installs the locked
dependencies and runs the test suite in an ignored staging worktree before it
changes the live source or dependencies. The final dependency swap and branch
update are recorded in `.runtime/update-transaction.json`; if the process or
computer stops partway through, run the updater again to complete or roll back
that transaction safely. The launcher will not start an incomplete update.

The updater rejects an update that tracks files in local-data directories or
stops ignoring those directories. Its own file operations do not read browser
storage or application data. Like any source updater, however, it executes npm
lifecycle scripts and the test code supplied by the repository in the staging
worktree. Only update from a repository you trust; this is not an operating-
system security sandbox for hostile source code.

Useful options:

```bash
npm run update -- --check
npm run update -- --skip-tests
```

`--check` reports whether commits are available without changing files.
Unknown options are rejected instead of being silently treated as a real
update.

## Development

```bash
npm install
npm run dev
npm test
npm run lint
```

The application uses vinext, React, Vite, and Cloudflare's local development
runtime. `.openai/hosting.json` retains the optional Sites binding contract;
D1 and R2 remain disabled for this local-first application.

## Creator guides

- [Vibe-coding a plug-in](docs/VIBE_CODING_PLUGIN.md)
- [Vibe-coding a workflow](docs/VIBE_CODING_WORKFLOW.md)
- [Node purpose, ports, and rules reference](docs/NODE_REFERENCE.md)
