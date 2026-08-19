# Vibe-coding guide: make a Magic Conch workflow

This guide turns an idea into a testable Magic Conch workflow with the help of an AI assistant. A strong workflow is not the one with the most nodes. It is the smallest graph whose inputs, decisions, side effects, and final result you can inspect.

## What a workflow is

A workflow is a directed graph:

```text
Start → gather or load input → process → route or save → End
```

Nodes do work. Typed data connections carry values between named ports. Every workflow must contain **exactly one Start node and exactly one End node**. The run begins at that Start, and every successful branch must converge on that single End. Branches whose required upstream values are not produced remain inactive.

> **Single-entry/single-exit rule:** never generate a second Start or End node. When a workflow branches, merge the branch results before the one End node.

Build in the visual editor first. JSON is useful for generating repeatable examples and moving workflows between devices, but the editor is the quickest place to discover port names and tune node settings.

## The fastest build loop

1. Write the outcome: “Given a message, return a concise three-bullet summary.”
2. Write one representative input and the exact shape of a good output.
3. Create a new workflow and connect **Start** directly to **End**.
4. Insert one processing node, usually **Request**, **Transform**, or **Code**.
5. Configure only the fields required for the first test.
6. Run the representative input in **Chat**.
7. Open **Debug** and inspect each node's inputs and outputs.
8. Add routing, files, retries, or persistence only after the straight path works.
9. Export JSON for lightweight definitions (including called workflows), or **Export with files** for a portable ZIP.

This sequence gives your coding assistant concrete evidence at every iteration.

## Plan the graph before placing nodes

Fill in this small contract:

```text
Outcome:
Trigger/input:
Final output:
External services:
Files read or written:
Decision points:
Failure behavior:
One example input:
One expected output:
```

Then express the happy path in a single line. For example:

```text
Start.prompt → Request.prompt → End.prompt
```

If you cannot describe the happy path in one line, split the goal into a reusable child workflow or remove optional behavior from the first version.

## Build a first workflow in the editor

Example goal: turn any message into a short action plan.

1. Select **New workflow** and name it `Action Plan`.
2. Keep the generated **Start** and **End** nodes.
3. Add a **Request** node from the AI section.
4. Connect `Start.prompt` to `Request.prompt`.
5. Connect `Request.prompt` to `End.prompt`.
6. In **Request**, choose a configured provider and model.
7. Set the system prompt to:

   ```text
   Turn the user's request into a practical action plan. Return three to five numbered steps. State assumptions briefly and do not invent completed work.
   ```

8. Switch to **Chat**, send `Prepare a 20-minute project kickoff`, and inspect the answer.
9. Open **Debug**. Confirm that Start emitted the message, Request received it, and End received the model response.

If attachments matter, also connect the `files` ports from Start through Request to End. Text and files travel on separate connections.

## Use the right node for the job

| Need | Start with |
| --- | --- |
| Receive the chat message and attachments | **Start** |
| Ask the user a follow-up question | **Input** |
| Call a configured model | **Request** |
| Have AI assign content to named outputs | **AI Assigner** |
| Use another workflow as a component | **Workflow** |
| Add a constant | **String**, **Integer**, or **Float** |
| Calculate a numeric result | **Math** |
| Read files from a directory | **Load** or **List Directory** |
| Extract text with OCR | **OCR** |
| Save text or files | **Save** |
| Reshape or extract data | **Transform** or **Parser** |
| Run custom local logic | **Code** |
| Combine several values | **Join** |
| Repeat over items | **Loop** |
| Split concurrent work | Connect one output to multiple downstream branches |
| Pause or retry | **Wait** or **Retry** |
| Choose a path | **Condition** or **Router** variants |
| Return a chat result | **End** |

Use typed ports as design feedback. If two ports refuse to connect, the data contract is probably wrong. String-like types are compatible with one another, numeric types are compatible with one another, media outputs can feed `files`, and `ANY` accepts anything.

## Generate an importable workflow JSON

For simple graphs, an AI assistant can generate the complete file. Save this example as `action-plan.workflow.json`, then use **Import** in the workflow editor:

```json
{
  "id": "wf-action-plan-template",
  "name": "Action Plan",
  "description": "Turns a chat request into a short, practical action plan.",
  "version": 4,
  "updatedAt": "2026-08-19T00:00:00.000Z",
  "nodes": [
    {
      "id": "start-1",
      "type": "start",
      "name": "New message",
      "x": 80,
      "y": 180,
      "config": {
        "agentName": "Action Planner",
        "startMessage": "What would you like to plan?"
      }
    },
    {
      "id": "request-1",
      "type": "request",
      "name": "Create action plan",
      "x": 390,
      "y": 180,
      "config": {
        "provider": "openai",
        "model": "gpt-4o-mini",
        "systemPrompt": "Turn the user's request into a practical action plan. Return three to five numbered steps. State assumptions briefly and do not invent completed work.",
        "temperature": 0.4
      }
    },
    {
      "id": "end-1",
      "type": "end",
      "name": "Reply",
      "x": 700,
      "y": 180,
      "config": {}
    }
  ],
  "edges": [
    {
      "id": "edge-prompt-1",
      "from": "start-1",
      "fromPort": "prompt",
      "to": "request-1",
      "toPort": "prompt",
      "dataType": "prompt"
    },
    {
      "id": "edge-prompt-2",
      "from": "request-1",
      "fromPort": "prompt",
      "to": "end-1",
      "toPort": "prompt",
      "dataType": "prompt"
    }
  ]
}
```

After import, select a provider/model that exists in your own settings. Model availability changes; treat names in shared JSON as placeholders unless you know the recipient has the same provider configuration.

### JSON structure

The workflow requires:

| Field | Meaning |
| --- | --- |
| `id` | Stable identifier in the exported file; imported workflows receive a new local ID. |
| `name` | Display name. |
| `description` | Short outcome-oriented explanation. |
| `version` | Current workflow format version is `4`. |
| `updatedAt` | ISO 8601 timestamp. |
| `nodes` | Node objects with unique `id`, `type`, `name`, coordinates, and `config`. |
| `edges` | Connections with unique IDs and matching node/port references. |

An edge should specify `from`, `fromPort`, `to`, `toPort`, and `dataType`. The port IDs must exist on those node types. Node coordinates are canvas positions; spacing nodes roughly 300 pixels apart makes generated files readable on first import.

### Exact workflow object shape

The actual imported/exported object has this shape. A `?` marks an optional property for reference and is not JSON syntax.

```ts
type Workflow = {
  id: string;
  name: string;
  description: string;
  version: number;                // Use 4 for newly generated workflows
  updatedAt: string;              // ISO 8601
  nodes: Array<{
    id: string;
    type: string;                 // Built-in type or namespaced plug-in node type
    name: string;
    x: number;
    y: number;
    config: Record<string, unknown>;
  }>;
  edges: Array<{
    id: string;
    from: string;                 // Source node id
    fromPort: string;
    to: string;                   // Destination node id
    toPort: string;
    dataType: string;
  }>;
  files?: Array<{
    name: string;
    type: string;
    data: string;                 // A data: URL
    size: number;
    bundleLoadNodeId?: string;
  }>;
  bundledLoads?: Record<string, { value: string }>;
};
```

For generated files, use only JSON properties and values—double-quoted keys and strings, no comments, no trailing commas, and no `undefined`, `NaN`, or `Infinity`.

### Built-in type and port IDs

The IDs below are the stable strings used in JSON. Labels visible in the editor may be more readable.

| Node | JSON `type` | Main input ports | Main output ports |
| --- | --- | --- | --- |
| Start | `start` | `agent_name`, `start_message` | `prompt`, `files`, `image`, `video`, `audio`, `document` |
| Message | `input` | `prompt`, `question`, `files`, media, `document` | `prompt`, `files`, media, `document` |
| Request | `request` | `prompt`, `system_prompt`, `model`, `temperature`, `output_file_name`, files/media/document | `prompt`, `files`, media, `document` |
| Use Workflow | `workflow` | `prompt`, `files`, media, `document` | `prompt`, `files`, media, `document` |
| Transform | `transform` | `value` | `result` |
| Code | `code` | `input` | `result` |
| Parser | `parser` | `source`, `document` | `data`, `text` |
| Save | `save` | `prompt`, `key`, `subfolder`, `files`, media | `prompt`, `files`, media |
| Load | `load` | `trigger`, `key`, `subfolder`, `recursive` | `prompt`, `files`, media, `document` |
| End | `end` | `prompt`, `files`, `image`, `video`, `audio`, `document` | none |

Other built-in type IDs are `chat-session`, `load-settings`, `update-memory`, `ai-assigner`, `string`, `integer`, `float`, `math`, `media-size`, `file-name`, `ocr`, `list-directory`, `set-state`, `loop`, `retry`, `wait`, `join`, `condition-ai`, `condition-rule`, `router-condition`, `router-ai`, and `router-rule`.

Dynamic nodes need IDs stored in configuration. For example, router output ports are the `id` values in `config.routeOptions`; Join and Math input ports come from `config.joinInputs` and `config.mathInputs`. The safest way to use a dynamic node is to configure it in the editor once, export JSON, and give that exported object to the coding assistant as the format template.

### Common `config` objects

`config` is always an object, even when empty. These are valid, minimal examples for frequently generated nodes:

```json
{
  "start": {
    "agentName": "Action Planner",
    "startMessage": "What would you like to plan?"
  },
  "request": {
    "provider": "openai",
    "model": "gpt-4o-mini",
    "systemPrompt": "Return three to five numbered steps.",
    "temperature": 0.4
  },
  "input": {
    "prompt": "Which output format would you prefer?"
  },
  "transform": {
    "transformOperation": "template",
    "template": "Result: {{value}}"
  },
  "code": {
    "codeLanguage": "javascript",
    "code": "return input;"
  },
  "save": {
    "key": "latest-result",
    "fileExtension": "md",
    "collision": "overwrite",
    "saveFiles": "both"
  },
  "end": {}
}
```

This block is a reference map, not a workflow node. Copy only the inner object that matches the node's `type`. Provider-specific Request settings are optional and are best selected in the editor.

For a plug-in node, set `type` to its namespaced node type and store field values under `config.pluginConfig`:

```json
{
  "id": "prefix-1",
  "type": "friendly-text:add-prefix",
  "name": "Add Prefix",
  "x": 390,
  "y": 180,
  "config": {
    "pluginConfig": {
      "prefix": "Result: "
    }
  }
}
```

The corresponding plug-in must already be installed for a plain workflow JSON import. Called workflows are bundled transitively in JSON exports, while a portable ZIP can also carry plug-ins as dependencies.

### Build the workflow artifact

For a normal workflow, the build output is simply one UTF-8 JSON file containing one workflow object. A conventional name is `<workflow-name>.json`.

Validate JSON syntax on Windows:

```powershell
Get-Content -Raw .\action-plan.json | ConvertFrom-Json | Out-Null
```

Validate JSON syntax on macOS or Linux:

```bash
node -e "JSON.parse(require('fs').readFileSync('action-plan.json', 'utf8'))"
```

Syntax validation does not prove that node and port IDs exist. Import the file, inspect the canvas, run it in Chat, and check Debug to validate the runtime graph.

Use the application's **Export with files** action to build a portable workflow ZIP. Its generated format can contain:

```text
action-plan.zip
├── workflow.json
├── files/
│   └── bundled workflow assets
└── dependencies/
    ├── workflows/
    │   └── <number>-<id>/
    │       ├── workflow.json
    │       └── files/
    └── plugins/
        └── <number>-<id>/
            ├── plugin.json
            └── files/
```

Do not hand-build this dependency ZIP unless you are reproducing the application's exporter exactly. Import remaps called-workflow IDs and materializes bundled Load snapshots; using **Export with files** preserves those relationships automatically.

### Import and verify the format

1. In the workflow editor, choose **Import** and select the JSON or ZIP file.
2. Confirm that all expected nodes are visible and no plug-in node has an unknown type.
3. Open each Request node and choose an available configured provider/model.
4. Count the boundary nodes: there must be exactly one Start and exactly one End.
5. Check that every successful path begins at the single Start and converges on the single End.
6. Run one representative message in Chat.
7. In Debug, compare actual port inputs and outputs with the intended data contract.
8. Export the imported workflow again. That export is the canonical normalized template for later AI-assisted edits.

## Prompt your coding assistant well

Use this prompt to design a graph before requesting JSON:

```text
Design the smallest Magic Conch workflow for this outcome: [outcome].

Input: [input]
Output: [output]
Allowed external services: [services or none]
Files read/written: [details or none]
Failure behavior: [behavior]

Hard graph constraint:
- The complete workflow must have exactly one Start node and exactly one End node.
- Never create separate End nodes for branches; merge successful branches before the single End.

First return:
1. A one-line happy-path graph using Node.port → Node.port notation.
2. A table of nodes and only the settings that must be configured.
3. Two test cases with expected output shape.

Do not add branches, storage, retries, or code unless the requirement needs them.
```

Once the design looks right, continue with:

```text
Now return a complete importable Magic Conch workflow JSON.

Requirements:
- Use workflow format version 4.
- Include exactly one Start node and exactly one End node—never multiple Start or End nodes.
- Make every successful branch converge before the single End node.
- Give every node and edge a unique stable ID.
- Include fromPort, toPort, and dataType on every edge.
- Keep text and files on separate edges.
- Use only these approved node types and port names: [paste the confirmed design].
- Place nodes left to right with about 300 pixels between stages.
- Return valid JSON only.
```

When debugging, paste the exported debug event or summarize it exactly:

```text
Expected final output: [value or shape]
Observed final output/error: [exact text]
Last successful node and outputs: [debug data]
First failed or skipped node and inputs: [debug data]
Workflow JSON: [paste]

Identify the broken data contract or setting. Make the smallest correction and return the complete corrected JSON.
```

## Grow the workflow safely

### Add a user question

Insert **Input** only when the workflow genuinely cannot proceed. Put the question in its settings, then pass its `prompt` output forward. Test both the initial pause and the resumed run.

### Add routing

Define route labels as mutually exclusive outcomes. Test every route plus an input that matches none. Do not add an End to each route. Merge successful branch results with a suitable Join/Aggregate step, then connect the merged result to the workflow's single End node. A branch that intentionally produces no result may terminate without reaching End.

### Add parallel work

Connect one output port directly to each downstream branch. Links define the dependencies, and nodes whose dependencies are ready run in parallel automatically under the application's workflow concurrency limit. Keep the number of branches modest, especially when every branch calls an API. Use **Join** to make the merge explicit before later work depends on every branch.

### Add a child workflow

Use a **Workflow** node for behavior that is independently meaningful and reusable. The called workflow must also contain exactly one Start and exactly one End. Portable ZIP export includes transitively called workflows and remaps their IDs during import.

### Add files and persistence

Save and Load paths may be relative to the Magic Conch program folder or absolute. With no configured directory, they use `user-data/` by default. Their optional `fileExtension` setting accepts values such as `json`, `.txt`, or `md`; it defaults to `json`, must match between paired Save and Load nodes, and changes the record filename rather than its JSON content. **Export JSON** contains the root definition and any transitively called workflow definitions; **Export with files** creates a ZIP that also contains used plug-ins and snapshots of runtime Load/List Directory data.

Do not use Load/Save as invisible glue. Name keys and subfolders after the data they contain, and decide whether overwrites, timestamps, or increments are appropriate.

## Test matrix

Before sharing, run at least:

| Case | What to verify |
| --- | --- |
| Normal input | Expected End output is reached. |
| Empty or minimal input | The workflow asks for missing data or fails clearly. |
| Large or unusual input | No accidental truncation, runaway loop, or unreadable result. |
| Every route | Each branch activates only when intended, and successful branch results merge before the single End. |
| Provider/API failure | The error identifies the failing node and does not claim success. |
| Files, if used | Names, types, count, and saved location are correct. |
| Re-import | Exported JSON or ZIP imports into a fresh browser profile/app URL. |

Use the debugger as the source of truth. It records node status, inputs, outputs, model activity, and file sources. Export the debug log when another person or coding assistant needs to reproduce a failure.

## Definition of done

- The name and description state the outcome, not the implementation.
- There is exactly one Start, with a useful agent name and opening message.
- There is exactly one End, and every successful path converges on it.
- Every connection uses the intended output, input, and type.
- Model prompts describe the required output shape and uncertainty behavior.
- Branches, loops, retries, and side effects have explicit limits.
- No secret is embedded in exported node settings or code.
- The normal, boundary, failure, and re-import tests pass.
- The exported artifact matches the sharing goal: JSON for definitions, ZIP for files and dependencies.

## Common failures

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| “This workflow needs a Start node” | Start was deleted or its type changed. | Add exactly one normal Start node. |
| More than one Start or End appears | The generated design treated branches as separate workflows. | Keep one Start and one End; merge branches before End and delete the extra boundary nodes. |
| Workflow finishes without an End | A route is inactive or a required upstream value never arrived. | Follow Debug from the last completed node and repair the missing edge or route. |
| A node is skipped | Its dependency was not produced on this run. | Inspect incoming ports and branch conditions. |
| Connection is refused | Output and input types are incompatible. | Choose the correct port or add a deliberate conversion node. |
| Text works but attachments disappear | Only prompt edges were connected. | Carry `files` and relevant media/document ports through the graph. |
| Imported workflow cannot call its model | The provider is not configured or the model name differs. | Configure Settings and select an available model in the node. |
| Imported plug-in node is unknown | Its plug-in is missing. | Install the plug-in first or share with **Export with files**. |
| Workflow repeats or floods an API | Loop, retry, or branch fan-out is too broad. | Add tight limits and test with concurrency set to 1. |

The application overview and portability behavior are documented in [`../README.md`](../README.md). The plug-in companion guide is [`VIBE_CODING_PLUGIN.md`](VIBE_CODING_PLUGIN.md).

For the purpose, exact ports, settings, and execution rules of every built-in node, see [`NODE_REFERENCE.md`](NODE_REFERENCE.md).
