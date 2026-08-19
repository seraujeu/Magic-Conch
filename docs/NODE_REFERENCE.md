# Magic Conch node reference

This document defines the purpose, exact input and output ports, important settings, and execution rules for every built-in Magic Conch node. Use the JSON `type` and port IDs shown here when creating or repairing a workflow programmatically.

## Rules that apply to every workflow

- A workflow must contain **exactly one Start node and exactly one End node**. Merge successful branches before the single End.
- Node IDs and edge IDs must be unique within the workflow.
- Every edge must name an existing `from`, `fromPort`, `to`, and `toPort` and carry the correct `dataType`.
- Graphs must be acyclic. A graph cycle stops execution with an error.
- A node normally runs only after its upstream nodes settle and at least one connected input emits a value. If a connected required input is inactive, the node is skipped.
- Load, Load Directory, and Update User Memory are pull-style sources and may run from settings without an incoming edge. Nodes with no input ports may also run as upstream dependencies.
- Join/Aggregate is an optional-input barrier: it runs after its upstream nodes settle and combines only branch values that were actually emitted.
- Ready nodes may run concurrently. The application-wide workflow parallelism setting is shared with called workflows.
- Port types must be compatible. `prompt`, `text`, and `string` are mutually compatible; `number`, `integer`, and `float` are mutually compatible; `any` accepts any type; media can feed a `files` input.
- Text and files are separate values. Connect both paths when a result must retain attachments.

## How to read port notation

Ports use `port_id:type`. For example, `prompt:prompt` means the JSON port ID is `prompt` and its data type is `prompt`. Dynamic ports are created from node configuration and must use the generated ID exactly.

## Essentials

### Start (`start`)

**Purpose:** Defines the single entry point, opening identity, and data included when a chat run begins.

**Inputs:** `agent_name:string`, `start_message:string`.

**Outputs:** `prompt:prompt`, `files:files`, `image:image`, `video:video`, `audio:audio`, `document:document`.

**Rules and settings:**

- Exactly one Start is allowed per workflow.
- `agentName` and `startMessage` set the displayed assistant identity and opening message. Connected String values can override them through the two input ports.
- Prompt composition can include the current message, selected prior message roles, displayed times, session/workflow metadata, run date/time, Start settings, and `startAdditionalContext`.
- File composition can include current and prior attachments. Media and document outputs are filtered views of the `files` output.
- Previous-message limits are clamped to 1–100, with newest matching messages retained.
- Start is initialized by the runner; do not create incoming process branches into it.

### Chat Session (`chat-session`)

**Purpose:** Loads a snapshot of messages and attachments that existed before the current run.

**Inputs:** none.

**Outputs:** `history:prompt`, `messages:any`, `session:any`, `files:files`, `image:image`, `video:video`, `audio:audio`, `document:document`, `title:string`, `session_id:string`, `session_number:integer`, `message_count:integer`, `updated_at:string`.

**Rules and settings:**

- Select user, assistant, and/or system roles; user and assistant default on, system defaults off.
- `sessionHistoryLimit` is clamped to 1–100 and keeps the newest selected messages.
- `history` is formatted text. `messages` is structured data. `session` contains ID, number, title, update time, selected previous-message count, and total previous-message count.
- Attachments can be exposed or suppressed. Duplicate attachments are removed.
- This node has no inputs and can act as an upstream context source.

### Message (`input`)

**Purpose:** Pauses a top-level workflow, asks the user a question, and resumes with the reply.

**Inputs:** `prompt:prompt`, `question:string`, `files:files`, `image:image`, `video:video`, `audio:audio`, `document:document`.

**Outputs:** `prompt:prompt`, `files:files`, `image:image`, `video:video`, `audio:audio`, `document:document`.

**Rules and settings:**

- The connected `question` overrides the configured `prompt` question.
- The workflow pauses until the next user response, then passes the resumed prompt and files forward.
- A called/reusable workflow cannot contain an active Message node; called workflows must run from Start to End without pausing.
- Use this node only when information is genuinely missing; unnecessary Message nodes make automation interactive.

### End (`end`)

**Purpose:** Returns the workflow's single final chat response and attachments.

**Inputs:** `prompt:prompt`, `files:files`, `image:image`, `video:video`, `audio:audio`, `document:document`.

**Outputs:** none.

**Rules and settings:**

- Exactly one End is allowed per workflow. Every successful branch must merge before it.
- Final text is selected in this order: connected prompt (or the current/resumed user message when no prompt edge supplies a value), most recent node output, most recently loaded data, then `Workflow complete.`
- File and media inputs are flattened and returned as the final attachments.
- End has no configuration beyond its node name.

## Personalization

### Load User Settings (`load-settings`)

**Purpose:** Reads the locally stored user preference and memory for use inside the workflow.

**Inputs:** none.

**Outputs:** `settings:prompt`, `preference:text`, `memory:text`, `memories:any`, `memory_count:integer`.

**Rules and settings:**

- `settings` combines the enabled preference and memory sections for direct connection to a model prompt.
- `preference` and `memory` are separate text outputs; `memories` is the structured memory array.
- `settingsIncludePreference` and `settingsIncludeMemory` independently control inclusion and default to enabled.
- Data remains local until a downstream node, such as Request, sends it to an external provider.

### Update User Memory (`update-memory`)

**Purpose:** Adds, updates, deletes, or clears persistent user memory.

**Inputs:** `content:text`, `memory_id:string`.

**Outputs:** `memory:any`, `memories:any`, `memory_text:text`, `count:integer`, `changed:boolean`.

**Rules and settings:**

- `memoryOperation` is `add`, `update`, `delete`, or `clear`.
- Connected `content` and `memory_id` values override `memoryContent` and `memoryId` fallbacks.
- Update and delete require an existing memory ID. Clear ignores content and ID.
- Changes persist immediately on the device and affect later nodes and workflow runs.
- The node can run as a pull-style source without an incoming edge.

## AI

### Request (`request`)

**Purpose:** Sends a prompt and optional files to a configured AI model and emits the response.

**Inputs:** `prompt:prompt`, `system_prompt:string`, `model:string`, `temperature:float`, `output_file_name:string`, `files:files`, `image:image`, `video:video`, `audio:audio`, `document:document`.

**Outputs:** `prompt:prompt`, `files:files`, `image:image`, `video:video`, `audio:audio`, `document:document`.

**Rules and settings:**

- Choose `provider` (`openai`, `gemini`, `claude`, or `ollama`) and a model available to that provider.
- Connected system prompt, model, temperature, and output filename override configured values.
- Input attachments are supplied to the provider and summarized into prompt sections where applicable. Treat this as a privacy boundary.
- The response becomes the `prompt` output. Input files pass through.
- If `outputFileName` or `output_file_name` is set, the text response is also appended as a `text/plain` workflow file.
- Provider-specific reasoning, token, sampling, stop, context, and thinking settings are optional. Unsupported combinations may be rejected by the provider.
- The node throws on provider, authentication, network, or model errors; it does not silently produce a fallback answer.

### AI Work Assigner (`ai-assigner`)

**Purpose:** Uses a model to create standalone work prompts for one or more named downstream workers.

**Inputs:** `prompt:prompt`, `system_prompt:string`, `model:string`, `temperature:float`, `files:files`, `image:image`, `video:video`, `audio:audio`, `document:document`.

**Outputs:** Dynamic `prompt` ports whose IDs come from `config.routeOptions[].id`.

**Rules and settings:**

- Every output option has an ID, label, optional activation description (`value`), and optional export instruction.
- Multiple outputs may activate in the same run. Outputs omitted by the model emit nothing, so their downstream branches stay inactive.
- The node adds the required named-section response format to the configured system prompt automatically.
- Connect each output directly to a downstream Request prompt when it represents a worker assignment.
- Output IDs are part of the graph contract. Do not regenerate them without updating all connected edges.

## Values

### String (`string`)

**Purpose:** Supplies a constant string to a compatible data or setting port.

**Inputs:** none.

**Outputs:** `value:string`.

**Rules and settings:** `stringValue` defaults to an empty string. The node can run as an upstream dependency even though it is not downstream of Start.

### Integer (`integer`)

**Purpose:** Supplies a constant whole number.

**Inputs:** none.

**Outputs:** `value:integer`.

**Rules and settings:** `integerValue` defaults to `0`; decimals are truncated.

### Float (`float`)

**Purpose:** Supplies a constant decimal number.

**Inputs:** none.

**Outputs:** `value:float`.

**Rules and settings:** `floatValue` defaults to `0` and is converted with JavaScript numeric rules.

### Math (`math`)

**Purpose:** Evaluates an arithmetic expression using named numeric inputs.

**Inputs:** Dynamic `number` ports from `config.mathInputs[].id`.

**Outputs:** `result:string`, `result:float`, or `result:integer`, selected by `mathOutputType`.

**Rules and settings:**

- Reference variables as `{{variable}}` in `mathExpression`; the default is `{{input1}}`.
- Supported operators include `+`, `-`, `*`, `/`, `%`, `^`, and `**`.
- Supported functions include `abs`, `ceil`, `floor`, `max`, `min`, `pow`, `round`, `sign`, and `sqrt`; constants include `PI` and `E`.
- Linking the last input creates another input. Keep generated input IDs stable in JSON.
- Invalid expressions or nonnumeric values fail rather than being guessed.

### Variable / Set State (`set-state`)

**Purpose:** Stores a named value in the current workflow run and passes it onward.

**Inputs:** `value:any`.

**Outputs:** `value:any`.

**Rules and settings:**

- `variableName` defaults to `result`.
- If `value` is not connected, `stateValue` is parsed according to `valueType`: `text`, `number`, `boolean`, or `json`.
- Boolean fallback parsing treats only case-insensitive `true` as true. Invalid JSON throws.
- State exists in the current run context; this node does not persist it across runs.

## Files

### Load Directory (`list-directory`)

**Purpose:** Reads all files from a configured directory/subfolder.

**Inputs:** `trigger:any`, `subfolder:string`, `recursive:boolean`.

**Outputs:** `files:files`, `image:image`, `video:video`, `audio:audio`, `names:any`, `count:integer`.

**Rules and settings:**

- `directoryPath` may be absolute or relative to the Magic Conch program folder. The default application folder setting is used when omitted.
- Connected `subfolder` and `recursive` override `subfolder` and `includeSubfolders` settings.
- `names` is an array of file names; media outputs are filtered subsets of `files`.
- With no incoming edge, it runs as a pull-style source. Connecting `trigger` or another input gates execution on that edge.
- Portable export can snapshot loaded files so an imported workflow no longer depends on the original directory.

### Load (`load`)

**Purpose:** Reads previously saved records or all files in a folder.

**Inputs:** `trigger:any`, `key:string`, `subfolder:string`, `recursive:boolean`.

**Outputs:** `prompt:prompt`, `files:files`, `image:image`, `video:video`, `audio:audio`, `document:document`.

**Rules and settings:**

- `loadMode` is `latest`, `all`, `exact`, or `folder`.
- Connected `key`, `subfolder`, and `recursive` values override configured fallbacks.
- `folder` mode uses `includeSubfolders`/`recursive` and returns file names as the prompt value.
- Other modes use `key` (default `workflow-result`) to select saved records.
- `fileExtension` selects the record extension, with or without a leading dot, and defaults to `json`. Save and Load must use the same extension.
- Directory paths follow the same absolute/relative rules as Load Directory.
- With no incoming edge, Load runs as a pull-style source; any connected input becomes an execution gate.

### Save (`save`)

**Purpose:** Persists prompt data, workflow files, or both to a local directory.

**Inputs:** `prompt:prompt`, `key:string`, `subfolder:string`, `files:files`, `image:image`, `video:video`, `audio:audio`.

**Outputs:** `prompt:prompt`, `files:files`, `image:image`, `video:video`, `audio:audio`.

**Rules and settings:**

- Connected `key` and `subfolder` override configured values. The default key is `workflow-result`.
- `fileExtension` selects the record extension, with or without a leading dot, and defaults to `json`. The record content remains JSON.
- `saveFiles` is `data`, `files`, or `both`.
- `collision` is `increment`, `timestamp`, or `overwrite`.
- Directory paths may be absolute or relative; omitted paths use the application default, normally `user-data/`.
- Outputs pass the original data and files through after persistence.

### Get Image / Video Size (`media-size`)

**Purpose:** Reads the pixel dimensions of the first connected image or video.

**Inputs:** `files:files`, `image:image`, `video:video`.

**Outputs:** `width:integer`, `height:integer`.

**Rules and settings:** At least one image or video is required. The node chooses the first usable asset and throws if none is present.

### Get File Name (`file-name`)

**Purpose:** Extracts the name of the first connected file.

**Inputs:** `files:files`, `image:image`, `video:video`, `audio:audio`, `document:document`.

**Outputs:** `name:string`.

**Rules and settings:** `includeExtension` defaults to true. The node chooses the first usable asset and throws if none is present.

### OCR (`ocr`)

**Purpose:** Extracts text from connected images and PDF documents and creates text files.

**Inputs:** `files:files`, `image:image`, `document:document`.

**Outputs:** `text:text`, `results:any`, `files:files`, `count:integer`.

**Rules and settings:**

- At least one image or PDF is required.
- `ocrEngine` may be `tesseract`, `openai`, `gemini`, `claude`, or `ollama`.
- Tesseract.js runs in the browser and requires an explicit language; `auto` is invalid.
- Cloud engines send rendered pages to the selected provider. Ollama uses the configured local server.
- `ocrPrimaryLanguage`, `ocrAdditionalLanguages`, and `ocrPdfScale` control recognition and PDF rendering. Higher scale uses more memory and time.
- AI OCR requires a vision-capable `ocrModel`.
- `results` is structured per source; `files` contains one generated text file per input; `text` combines all results.

## Processing

### Transform (`transform`)

**Purpose:** Parses, extracts, formats, replaces, maps, or filters a value.

**Inputs:** `value:any`.

**Outputs:** `result:any`.

**Rules and settings:**

- `json_parse`: parses a string as JSON; nonstrings pass through.
- `extract`: selects a dot path such as `user.profile.name`.
- `template`: replaces `{{value}}` or `{{value.path}}` placeholders.
- `regex`: performs a global regular-expression replacement using `pattern` and `replacement`.
- `map`: maps an array to each item's configured dot path, or returns items unchanged when the path is empty.
- `filter`: keeps array items whose selected value contains `replacement`.
- Invalid JSON or regular expressions throw. Map/filter treat nonarrays as empty arrays.

### Code (`code`)

**Purpose:** Runs custom JavaScript or Python transformation logic.

**Inputs:** `input:any`.

**Outputs:** `result:any`.

**Rules and settings:**

- JavaScript is an async function body with `input` and `context` arguments and should `return` a value.
- Python runs in Pyodide with `input` and `context` globals and returns its final expression. Loading Pyodide may require network access the first time.
- The default code is `return input;` for JavaScript.
- Code is trusted local code, not a hostile-code security sandbox. Review it before running.
- Exceptions stop the workflow and appear in Debug.

### Parser (`parser`)

**Purpose:** Converts JSON, XML, CSV, YAML, or Markdown text/documents into structured data.

**Inputs:** `source:any`, `document:document`.

**Outputs:** `data:any`, `text:text`.

**Rules and settings:**

- `parserFormat` is `auto`, `json`, `xml`, `csv`, `yaml`, or `markdown`.
- Auto chooses JSON for text starting with `[` or `{`, XML when markup is detected, CSV when a comma is present, and Markdown otherwise.
- JSON and malformed XML can throw errors.
- CSV parsing is intentionally simple: rows split on newlines and cells split on commas; quoted embedded commas are not a full CSV implementation.
- YAML parsing supports simple `key: value` lines, not the complete YAML specification.
- Markdown output contains original text plus extracted headings and links.
- When `document` is connected, the first document is used as the text source.

### Join / Aggregate (`join`)

**Purpose:** Merges values from parallel or routed branches into one result.

**Inputs:** Dynamic `any` ports from `config.joinInputs[].id`.

**Outputs:** `result:any`.

**Rules and settings:**

- `aggregateOperation` is `array`, `object`, `concat`, `sum`, or `template`.
- Array collects emitted values; object keys them by variable name; concat joins their string forms; sum converts them to numbers; template interpolates `{{variable}}` and dot paths.
- Linking the last input creates another input. Keep input IDs stable in generated JSON.
- Join runs after all upstream nodes settle even when one routed branch emits nothing. Non-template operations omit missing values.
- Template aggregation preserves placeholders for configured variables and converts missing values to empty text when the variable exists without a value.
- Use Join to converge branches before the workflow's single End node.

## Flow control

### Use Workflow (`workflow`)

**Purpose:** Runs another saved workflow as a reusable component.

**Inputs:** `prompt:prompt`, `files:files`, `image:image`, `video:video`, `audio:audio`, `document:document`.

**Outputs:** `prompt:prompt`, `files:files`, `image:image`, `video:video`, `audio:audio`, `document:document`.

**Rules and settings:**

- `calledWorkflowId` must identify another existing workflow; self-selection is excluded.
- The called workflow must contain exactly one Start and one End under the authoring rules.
- An active Message node is forbidden inside a called workflow because reusable workflows cannot pause for user input.
- Recursive calls are detected and rejected.
- Child nodes share the parent's concurrency budget.
- Outputs contain the called workflow's final text and files.

### Loop / For Each (`loop`)

**Purpose:** Exposes iteration state for an array, object, file collection, or scalar.

**Inputs:** `items:any`.

**Outputs:** `item:any`, `index:number`, `has_more:boolean`, `done:boolean`.

**Rules and settings:**

- Arrays iterate by item; objects become `{ key, value }` entries; a scalar becomes a one-item collection. If no `items` value is connected, files are preferred, then the prompt.
- During an item step it emits `item`, zero-based `index`, and `has_more`. When exhausted it emits only `done:true` and clears its internal run state.
- Loop state is stored in the current workflow context, not persisted across runs.
- Workflow graphs must remain acyclic; do not draw an edge back to Loop or an earlier node.
- Downstream logic must use the emitted routing signals deliberately. Test multi-item behavior in Debug rather than assuming an upstream node is automatically re-executed.

### Retry (`retry`)

**Purpose:** Routes an explicit success/failure result into success, retry, or exhausted paths.

**Inputs:** `success:boolean`, `error:any`.

**Outputs:** `next:boolean`, `retry:boolean`, `failed:boolean`, `attempt:number`, `parameters:any`, `error:any`.

**Rules and settings:**

- The node does not catch arbitrary upstream exceptions. Supply a boolean `success` and an error value from logic that represents the attempted operation.
- On success it emits `next:true` and clears attempt state.
- Before `maxAttempts`, failure waits `delayMs` and emits `retry:true`; at the limit it emits `failed:true`.
- `retryParameters` must be valid JSON and is emitted as `parameters` on each execution.
- Attempt state is local to the current run. Keep the graph acyclic; use the output as a routing signal rather than drawing a backward edge.

### Wait / Delay (`wait`)

**Purpose:** Delays a value before passing it forward.

**Inputs:** `value:any`.

**Outputs:** `value:any`.

**Rules and settings:** `delayMs` is clamped to zero or greater and defaults to 1000 ms. Long waits occupy an execution task and delay completion.

## Routing and conditions

### Rule Condition (`condition-rule`)

**Purpose:** Evaluates a deterministic boolean rule for `if`/`elif`/`else` control.

**Inputs:** `value:any`, `gate:boolean`, `files:files`, `image:image`, `video:video`, `audio:audio`, `document:document`.

**Outputs:** `true:boolean`, `false:boolean`.

**Rules and settings:**

- Only the selected output is emitted: `true:true` on a match or `false:false` otherwise.
- `gate` can be connected to a previous condition's false output to form `elif`; if the gate is inactive, this node is skipped.
- `routeMethod` may be `contains`, `not_contains`, `equals`, `starts_with`, `ends_with`, `regex`, `length_gt`, `length_lt`, `is_empty`, `file_type`, `file_count_gt`, `number_gt`, or `number_lt`.
- `routeValue` is the comparison value. Text matching is case-insensitive unless `caseSensitive` is true.
- Invalid regular expressions evaluate false rather than throwing.

### AI Condition (`condition-ai`)

**Purpose:** Asks an AI model for one boolean decision.

**Inputs:** `value:any`, `gate:boolean`, `files:files`, `image:image`, `video:video`, `audio:audio`, `document:document`.

**Outputs:** `true:boolean`, `false:boolean`.

**Rules and settings:**

- Configure provider, model, and `routeCriteria`; temperature is forced to zero at execution.
- The model is instructed to return only true or false. Ambiguous responses throw an error.
- Only the selected boolean port is emitted.
- `gate` supports `elif` chaining in the same way as Rule Condition.
- Files may be sent to the configured provider.

### Condition Router (`router-condition`)

**Purpose:** Routes the original value through a true or false branch using a simple local condition.

**Inputs:** `value:any`, `files:files`, `document:document`.

**Outputs:** `true:any`, `false:any`, `matched:boolean`.

**Rules and settings:**

- `conditionKind` is `truthy`, `equals`, `contains`, `input_type`, or `file_extension`.
- `conditionValue` supplies the expected value except for `truthy`.
- The original input value is emitted on exactly one of `true` or `false`; `matched` is always emitted.
- `equals` and `contains` are case-sensitive in this node.
- `input_type` recognizes JavaScript types plus `array`, `null`, and document detection. `file_extension` checks connected files.

### Rule Router (`router-rule`)

**Purpose:** Sends the original prompt to one dynamic route using ordered deterministic rules.

**Inputs:** `prompt:prompt`, `files:files`, `image:image`, `video:video`, `audio:audio`, `document:document`.

**Outputs:** Dynamic `prompt` ports from `config.routeOptions[].id`.

**Rules and settings:**

- Uses the same `routeMethod` choices as Rule Condition. Each option supplies its own match `value`.
- Options are checked in order; the first match wins.
- If no option matches, the **last option is always used as the fallback**. Design and label it accordingly.
- Exactly one route emits the original prompt.
- Keep option IDs stable because edges reference them directly.

### AI Router (`router-ai`)

**Purpose:** Uses an AI classifier to select exactly one named prompt route.

**Inputs:** `prompt:prompt`, `files:files`, `image:image`, `video:video`, `audio:audio`, `document:document`.

**Outputs:** Dynamic `prompt` ports from `config.routeOptions[].id`.

**Rules and settings:**

- Configure provider, model, `routeCriteria`, and named options. Temperature is forced to zero.
- The model is instructed to return one option number. The first number in its response is clamped to the valid option range; missing numbers default to option 1.
- Exactly one route emits the original prompt.
- Files may be sent to the configured provider.
- Keep route IDs stable when editing generated workflow JSON.

## Custom plug-in nodes

### Plug-in node (`<plugin-id>:<node-id>`)

**Purpose:** Performs behavior declared by an installed plug-in manifest.

**Inputs:** Defined by the plug-in's `inputTypes.required` and `inputTypes.optional` maps.

**Outputs:** Defined by parallel `returnTypes` and `returnNames` arrays; the default is one `PROMPT` output when omitted.

**Rules and settings:**

- The node type must begin with its plug-in ID and a colon.
- Field values live under `node.config.pluginConfig`.
- The installed plug-in is required when importing plain workflow JSON. **Export with files** can include used plug-ins.
- Template, JavaScript, and HTTP executors follow the contracts in the [plug-in vibe-coding guide](VIBE_CODING_PLUGIN.md).
- Unknown custom types normalize to `any` for compatibility.
- Plug-in JavaScript is trusted local code; HTTP executors may transmit workflow data externally.

## Rule-method reference

These methods are shared by Rule Condition and Rule Router:

| Method | Result |
| --- | --- |
| `contains` | Source text contains the expected text. |
| `not_contains` | Source text does not contain the expected text. |
| `equals` | Source text equals expected text. |
| `starts_with` | Source begins with expected text. |
| `ends_with` | Source ends with expected text. |
| `regex` | Regular expression matches source; invalid patterns return false. |
| `length_gt` / `length_lt` | Source character count compares with a numeric expected value. |
| `is_empty` | Trimmed source is empty. |
| `file_type` | A file MIME type contains, or its filename ends with, the expected type/extension. |
| `file_count_gt` | Connected file count is greater than the expected number. |
| `number_gt` / `number_lt` | Numeric source compares with the numeric expected value. |

## Vibe-coding checklist

When asking an AI assistant to generate a workflow, include these constraints:

```text
- Use exactly one Start node and exactly one End node.
- Use only node type and port IDs from docs/NODE_REFERENCE.md.
- Keep dynamic Math, Join, Assigner, and Router port IDs stable and reference them exactly in edges.
- Include from, fromPort, to, toPort, and dataType on every edge.
- Keep the graph acyclic.
- Merge successful branches with Join/Aggregate before the single End.
- Carry prompt and files on separate edges when attachments must survive.
- Do not place a Message node in a workflow called by Use Workflow.
```

For the complete workflow JSON format, see [VIBE_CODING_WORKFLOW.md](VIBE_CODING_WORKFLOW.md).
