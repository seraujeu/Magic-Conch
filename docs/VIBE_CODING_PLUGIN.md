# Vibe-coding guide: make a Magic Conch plug-in

This guide is for building a working custom node with an AI coding assistant, even if you do not want to hand-write every line. The useful loop is small: describe one behavior, generate a minimal manifest, install it, test it in a tiny workflow, and improve it from the exact error or output you observe.

## What a plug-in is

A Magic Conch plug-in is either:

- one JSON manifest; or
- a ZIP containing `plugin.json` plus optional assets under `files/`.

Installing it adds its nodes to the workflow node library. Plug-ins are local to the browser profile and app URL in which they are installed.

Start with a single JSON file. Move to a ZIP only when code, prompts, templates, or other assets are large enough to deserve separate files.

## The fastest build loop

1. Write one sentence describing the node: “Take text and add a configurable prefix.”
2. Decide its inputs, settings, and outputs.
3. Ask your coding assistant to produce the smallest valid manifest.
4. Save it as `<name>.plugin.json`.
5. In Magic Conch, open **Settings → Plug-ins → Install plug-in**.
6. Add the new node to a workflow between **Start** and **End**.
7. Run one normal case and one awkward case, such as empty input.
8. Give the observed result or exact error back to the assistant and change one thing at a time.

Replacing an installed plug-in with the same `id` updates it. Existing workflow nodes continue to refer to their namespaced `type`, so keep that value stable after release.

## Start from this manifest

Save the following as `friendly-text.plugin.json`:

```json
{
  "id": "friendly-text",
  "name": "Friendly Text",
  "version": "0.1.0",
  "description": "Small text helpers created by vibe-coding.",
  "nodes": [
    {
      "type": "friendly-text:add-prefix",
      "label": "Add Prefix",
      "subtitle": "Put configurable text before a prompt",
      "color": "#7b61a8",
      "category": "text/formatting",
      "inputTypes": {
        "required": {
          "prompt": { "type": "PROMPT", "label": "prompt" }
        }
      },
      "returnTypes": ["PROMPT"],
      "returnNames": ["prompt"],
      "functionName": "add_prefix",
      "fields": [
        {
          "key": "prefix",
          "label": "Prefix",
          "type": "text",
          "default": "Result: "
        }
      ],
      "executor": {
        "kind": "javascript",
        "code": "return { prompt: String(config.prefix || '') + String(inputs.prompt || '') };"
      }
    }
  ]
}
```

Build a test workflow with these data connections:

```text
Start.prompt → Add Prefix.prompt → End.prompt
```

The test workflow, like every Magic Conch workflow created from these guides, must contain exactly one Start node and exactly one End node.

Change **Prefix** in the node settings, send a chat message, and confirm the reply contains the configured prefix.

## Manifest contract

The top level requires these fields:

| Field | Meaning |
| --- | --- |
| `id` | Stable, URL-like identifier such as `friendly-text`; use lowercase letters and hyphens. |
| `name` | Human-readable plug-in name. |
| `version` | Version string; semantic versions such as `0.1.0` are easiest to manage. |
| `description` | Optional explanation. |
| `nodes` | One or more node definitions. |
| `files` | Optional bundled assets. ZIP files under `files/` are discovered automatically. |

Every node requires `type`, `label`, and `executor`. Its `type` must start with the plug-in ID and a colon, for example `friendly-text:add-prefix`.

### Exact plug-in object shape

The complete format accepted by Magic Conch is shown below as a type reference. A `?` means the property is optional; it is notation for this guide and must not be copied into JSON.

```ts
type MagicConchPlugin = {
  id: string;
  name: string;
  version: string;
  description?: string;
  nodes: Array<{
    type: string;                 // Must begin with `${plugin.id}:`
    label: string;
    subtitle?: string;
    color?: string;               // CSS color, normally #RRGGBB
    category?: string;
    functionName?: string;
    inputTypes?: {
      required?: Record<string, {
        type: string;
        label?: string;
        multiple?: boolean;
      }>;
      optional?: Record<string, {
        type: string;
        label?: string;
        multiple?: boolean;
      }>;
    };
    returnTypes?: string[];
    returnNames?: string[];
    fields?: Array<{
      key: string;
      label: string;
      type: "text" | "textarea" | "number" | "select";
      default?: string | number;
      options?: string[];
    }>;
    executor:
      | { kind: "template"; template?: string; file?: string }
      | { kind: "javascript"; code?: string; file?: string }
      | { kind: "http"; url: string; method?: "GET" | "POST" };
  }>;
  files?: Array<{
    name: string;
    type: string;
    data: string;                 // A data: URL
    size: number;
  }>;
};
```

Magic Conch rejects a manifest when a required top-level property is absent, a node lacks `type`, `label`, or `executor.kind`, the type is not namespaced, or a local executor refers to a bundled file that is not present.

There are two correct physical formats:

```text
Plain JSON                         ZIP bundle
friendly-text.plugin.json         friendly-text.zip
└── one plug-in object             ├── plugin.json
                                   └── files/
                                       └── any supporting assets
```

For plain JSON, inline `code` and `template` values are easiest. If a plain JSON manifest contains `files`, every file must already be represented as a data URL. For example, the text `Hello` can be embedded like this:

```json
"files": [
  {
    "name": "templates/hello.txt",
    "type": "text/plain",
    "data": "data:text/plain;charset=utf-8,Hello",
    "size": 5
  }
]
```

For normal authoring, prefer a ZIP and place ordinary files under `files/`; Magic Conch creates the data URLs during installation.

### Inputs and outputs

Declare inputs inside `inputTypes.required` or `inputTypes.optional`. Each input has a `type`, an optional display `label`, and optional `multiple: true` when it may receive several connections.

Declare outputs with parallel arrays:

```json
"returnTypes": ["TEXT", "NUMBER"],
"returnNames": ["text", "length"]
```

The item at each index is one output. Always keep the array lengths aligned and use unique names.

Supported types include `PROMPT`, `FILES`, `TEXT`, `NUMBER`, `BOOLEAN`, and `ANY`. Magic Conch also recognizes `STRING`, `INTEGER`, `FLOAT`, `IMAGE`, `VIDEO`, `AUDIO`, and `DOCUMENT`. Unknown custom types behave like `ANY`.

String-like ports (`PROMPT`, `TEXT`, and `STRING`) connect to one another, as do numeric ports (`NUMBER`, `INTEGER`, and `FLOAT`). An `ANY` port is the escape hatch, but specific types make a node easier and safer to connect.

### Settings fields

Node settings appear in the right-side editor. Supported field types are:

| Type | Extra properties | Runtime value |
| --- | --- | --- |
| `text` | `default` | string |
| `textarea` | `default` | string |
| `number` | `default` | number |
| `select` | `options`, `default` | selected string |

Each field is available to the executor as `config.<key>`.

## Choose an executor

### Template: simplest text assembly

Use a template when the node only combines text:

```json
"executor": {
  "kind": "template",
  "template": "{{config.prefix}}{{inputs.prompt}}"
}
```

Templates can interpolate `{{input}}`, `{{inputs.portName}}`, `{{config.fieldName}}`, values in `context`, and bundled `files`. Missing values become empty strings.

### JavaScript: local logic

Use JavaScript for parsing, validation, branching inside the calculation, or multiple outputs:

```json
{
  "type": "friendly-text:measure",
  "label": "Measure Text",
  "inputTypes": {
    "required": {
      "text": { "type": "TEXT" }
    }
  },
  "returnTypes": ["TEXT", "NUMBER"],
  "returnNames": ["text", "length"],
  "executor": {
    "kind": "javascript",
    "code": "const text = String(inputs.text || ''); return { text, length: text.length };"
  }
}
```

The code is the body of an async function with five arguments:

```text
input, inputs, config, context, files
```

- `input` is a convenience value: `prompt`, `text`, `input`, or the first supplied input.
- `inputs` is an object keyed by input port name.
- `config` contains the node's settings fields.
- `context` contains workflow runtime context.
- `files` contains bundled plug-in assets as data URLs.

Return an object keyed by `returnNames`, an array in output order, or one value for the first output.

### HTTP: call a service

Use HTTP when the real work belongs in an API:

```json
"executor": {
  "kind": "http",
  "url": "https://api.example.com/transform",
  "method": "POST"
}
```

A POST sends JSON shaped as `{ input, inputs, config, context, files }`. A GET interpolates values into the URL and sends no body. Treat remote services as a privacy boundary: do not send chat text or files unless the user expects it.

## Move code and templates into a ZIP

Use this layout:

```text
friendly-text.zip
├── plugin.json
└── files/
    ├── scripts/add-prefix.js
    └── templates/wrapper.txt
```

Then reference an asset without the leading `files/`:

```json
"executor": {
  "kind": "javascript",
  "file": "scripts/add-prefix.js"
}
```

The JavaScript file contains the function body, not a module wrapper:

```js
const prefix = String(config.prefix || "");
return { prompt: prefix + String(inputs.prompt || "") };
```

ZIP assets are converted to local data URLs during import. You may explicitly describe assets in a top-level `files` array, but normal ZIP authoring does not require hand-writing encoded file data.

### Build the installable file

For an inline manifest, no compilation step is required. Confirm that it is valid JSON, then install the `.json` file directly.

PowerShell validation:

```powershell
Get-Content -Raw .\friendly-text.plugin.json | ConvertFrom-Json | Out-Null
```

For a bundled plug-in, create a source folder whose contents—not the outer folder—become the ZIP root:

```text
friendly-text-source/
├── plugin.json
└── files/
    └── scripts/
        └── add-prefix.js
```

Build it on Windows with PowerShell:

```powershell
Compress-Archive -Path .\friendly-text-source\* -DestinationPath .\friendly-text.zip -Force
```

Build it on macOS or Linux:

```bash
(cd friendly-text-source && zip -r ../friendly-text.zip plugin.json files)
```

Before installation, list the archive and confirm that `plugin.json` is at the root, not under `friendly-text-source/`:

```powershell
tar -tf .\friendly-text.zip
```

The first entries should resemble:

```text
plugin.json
files/scripts/add-prefix.js
```

Do not put executable code in `plugin.json` and a second, divergent copy under `files/`. Pick inline `code` or a `file` reference so there is one source of truth.

### Install and verify the format

1. Open **Settings → Plug-ins → Install plug-in**.
2. Select the JSON or ZIP artifact, not the source directory.
3. Confirm the installed card shows the expected ID's name, version, node count, and bundled file count.
4. Find the plug-in's named group in the node library.
5. Place every node at least once; this catches malformed port and field declarations.
6. Reinstall after changing the version or implementation. Keep `id` and released node `type` values stable.

## Prompt your coding assistant well

Copy this prompt and replace the bracketed parts:

```text
Create a minimal Magic Conch plug-in manifest.

Goal: [one sentence]
Plug-in id: [lowercase-hyphenated-id]
Inputs: [name and type for each]
Settings: [key, text/textarea/number/select, and default]
Outputs: [name and type for each]
Executor: [template, JavaScript, or HTTP]

Requirements:
- Return valid JSON only.
- Every node type must begin with "[id]:".
- Keep returnTypes and returnNames in the same order and length.
- Handle empty input without throwing.
- Use only documented executor arguments: input, inputs, config, context, files.
- Do not add capabilities I did not request.
```

For an iteration, provide evidence instead of saying “it does not work”:

```text
Here is the current manifest: [paste it]
Expected: [exact output]
Observed: [exact output or error]
Test input and settings: [values]
Change the smallest possible part and explain the cause in two sentences.
Return the complete corrected manifest.
```

## Definition of done

- The JSON parses, or the ZIP has `plugin.json` at its root.
- Installation shows the expected name, version, node count, and file count.
- Every node `type` begins with `<plugin-id>:`.
- Port names and types match the values read and returned by the executor.
- Empty, normal, and unexpected inputs produce understandable results.
- Reinstalling the same ID upgrades existing nodes without changing their type.
- Any HTTP data sharing is documented.
- The plug-in is installed only from a trusted source.

## Common failures

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| “missing an id, name, version, or nodes array” | A required top-level field is absent. | Add the field with the correct JSON type. |
| “node types must start with…” | The node is not namespaced. | Change `type` to `<plugin-id>:<node-name>`. |
| “needs JavaScript code” or “needs a template” | The executor has neither inline content nor `file`. | Add `code`, `template`, or a valid bundled-file reference. |
| “plug-in file … is missing” | The path does not match an asset under `files/`. | Match spelling and subfolders; omit the leading `files/`. |
| Output arrives on the wrong port | `returnNames` and returned keys do not align. | Make names identical and keep array order consistent. |
| A connection is refused | Port types are incompatible. | Use matching specific types or `ANY` deliberately. |
| HTTP works elsewhere but fails here | CORS, authentication, or network policy blocks the request. | Inspect the browser error and fix the service's browser-access policy. |

## Safety boundary

JavaScript plug-ins execute with the same local access as Magic Conch. Read the manifest and bundled source before installation. Never place secrets directly in a manifest, never install opaque code from an untrusted assistant or person, and prefer a narrow HTTP API over embedding broad credentials.

The repository also includes a working reference at [`../examples/text-tools.plugin.json`](../examples/text-tools.plugin.json) and a compact contract at [`../plugins/README.md`](../plugins/README.md).
