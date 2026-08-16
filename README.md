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
storage are portable across the supported operating systems. Direct folder
access uses the File System Access API, which is fully available in Chrome and
Edge. Browsers without that API can still use Magic Conch, but folder-connected
Load/Save features are unavailable; workflow JSON import/export remains
available.

## Install and launch

Clone or download the repository, then use the launcher for your system:

- Windows: double-click `Launch Magic Conch.bat`
- macOS/Linux: run `sh "Launch Magic Conch.sh"`
- Any system: run `npm install`, followed by `npm run launch`

The launcher installs dependencies when needed, uses the stable default port
4173, starts Magic Conch, and opens it in the default browser. It stops with a
clear message if that port is occupied so it does not silently switch to a
different browser-data area. To deliberately use another port, pass it to the
launcher, for example:

```bash
npm run launch -- 4173
```

Keep using the same URL (especially the same port) to see the same local data.
Browser storage is isolated by URL, browser profile, and device.

## Personal data and privacy

Magic Conch keeps these items outside the source repository:

- chat sessions and chat folders (IndexedDB)
- workflows, provider settings/keys, and installed plug-ins (local storage)
- remembered folder permissions (IndexedDB)
- Save/Load node output (`user-data/` by default)

When a Save, Load, or Load Directory node has no folder selected, it uses the
`user-data/` folder beside the program files. Change this path under
**Settings → General → Default folders**; relative paths start at the program
folder, and absolute paths are supported by the locally launched app. A folder
selected in Settings or on an individual node overrides this path.

Updating source files does not clear those stores. Personal data is not moved
to another computer automatically; workflow JSON can be exported and imported
when a workflow needs to be transferred.

Conventional local folders such as `chats/`, `workflows/`, `user-data/`,
`backups/`, `exports/`, and local contents of `plugins/` are ignored by Git.
Consequently, files inside `user-data/` are excluded from GitHub uploads and
remain untouched by the GitHub updater.

## Update safely from GitHub

From a Git clone:

- Windows: double-click `Update Magic Conch.bat`
- macOS/Linux: run `sh "Update Magic Conch.sh"`
- Any system: run `npm run update`

The updater only accepts a fast-forward update on a clean source tree. It then
installs the exact locked dependencies and runs the test suite. It never reads,
exports, deletes, or rewrites browser storage or ignored personal-data folders.

Useful options:

```bash
npm run update -- --check
npm run update -- --skip-tests
```

`--check` reports whether commits are available without changing files.

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
