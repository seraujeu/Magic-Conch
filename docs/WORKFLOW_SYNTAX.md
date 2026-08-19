# Workflow syntax

Magic Conch workflow text fields support tokens written as `{{token-name}}`. Workflow-wide tokens provide information about the current date, time, chat session, and workflow. Some nodes also use the same braces for their own input variables.

## Workflow-wide tokens

These tokens can be used in workflow text fields and resolve when a run starts.

| Token | Value | Example |
| --- | --- | --- |
| `{{date}}` | Local date in `YYYY-MM-DD` format | `2026-08-19` |
| `{{date-year}}` | Four-digit local year | `2026` |
| `{{date-month}}` | Two-digit local month | `08` |
| `{{date-day}}` | Two-digit local day | `19` |
| `{{date-weekday}}` | Localized weekday name | `Wednesday` |
| `{{time}}` | Local time in `HH:mm:ss` format | `14:05:09` |
| `{{time-hour}}` | Two-digit local hour, from `00` to `23` | `14` |
| `{{time-minute}}` | Two-digit local minute | `05` |
| `{{time-second}}` | Two-digit local second | `09` |
| `{{timestamp}}` | ISO 8601 date and time in UTC | `2026-08-19T05:05:09.000Z` |
| `{{chat-session-number}}` | Stable number assigned to the chat session | `12` |
| `{{chat-session-id}}` | Internal chat session ID | `session-abc` |
| `{{chat-session-title}}` | Current chat session title | `Daily report` |
| `{{workflow-name}}` | Name of the workflow currently running | `Research flow` |

`{{date}}` and `{{time}}` use the computer's local time zone. `{{timestamp}}` uses UTC, as indicated by the trailing `Z`. The weekday name follows the browser's locale, so it may appear in a language other than English.

## Basic use

Place any number of tokens inside configured text:

```text
Create the {{date-weekday}} report for chat #{{chat-session-number}}.
Workflow: {{workflow-name}}
Started: {{timestamp}}
```

For a run of `Research flow` on Wednesday, August 19, 2026, this could become:

```text
Create the Wednesday report for chat #12.
Workflow: Research flow
Started: 2026-08-19T05:05:09.000Z
```

Useful examples include:

- Start message: `Welcome to {{workflow-name}}.`
- Request prompt or additional context: `Prepare the report for {{date}}.`
- Save key: `report-{{date}}-{{chat-session-number}}`
- Save subfolder: `{{date-year}}/{{date-month}}`
- Message question: `What should be included in the {{date-weekday}} update?`

The editor's **Syntax** panel lists the workflow-wide tokens. Select a token there to copy it.

## Matching and expansion rules

- Token names are case-insensitive. `{{DATE}}` and `{{date}}` are equivalent.
- Spaces inside the braces are allowed. `{{ date }}` is equivalent to `{{date}}`.
- Multiple tokens in one string are expanded.
- The run uses one date and time snapshot, so workflow-wide date and time tokens remain consistent as its nodes execute.
- Configured strings nested in arrays or objects are expanded too. Object property names are not expanded.
- Unknown tokens remain unchanged. For example, `{{value}}` stays `{{value}}` unless the current node interprets it as node-local syntax.
- Values produced dynamically while a workflow runs are not automatically scanned again for workflow-wide tokens.
- There is no escape sequence for a recognized workflow-wide token. To preserve one literally, supply it as runtime data rather than writing it directly in a configured text field.

When a **Use Workflow** node calls another workflow, `{{workflow-name}}` refers to the called workflow inside that workflow. The called workflow otherwise uses the current chat session information.

## Node-local syntax

Some built-in nodes interpret placeholders after workflow-wide tokens have been expanded. Unknown workflow-wide tokens are deliberately preserved so these node-local placeholders can work.

### Math

Reference each configured numeric input by its variable name:

```text
{{price}} * {{quantity}}
```

Math supports:

- Operators: `+`, `-`, `*`, `/`, `%`, `^`, and `**`
- Functions: `abs`, `ceil`, `floor`, `max`, `min`, `pow`, `round`, `sign`, and `sqrt`
- Constants: `PI` and `E`

For example:

```text
round(({{subtotal}} * (1 + {{tax_rate}})) * 100) / 100
```

Variable names must match the names configured on the Math node. Math variable names must begin with a letter or underscore and may contain only letters, digits, and underscores.

### Transform template

The Transform node's `template` operation exposes `{{value}}`, plus dot paths for nested properties:

```text
Hello {{value.name}}. Your order is {{value.order.id}}.
```

If the input value is `{ "name": "Ada", "order": { "id": 42 } }`, the result is:

```text
Hello Ada. Your order is 42.
```

A missing path becomes an empty string.

### Join / Aggregate template

The Join node's `template` operation exposes each configured input by its variable name. Dot paths select nested values:

```text
{{person.name}} says: {{message}}
```

If `person` is `{ "name": "Ada" }` and `message` is `Hello`, the result is:

```text
Ada says: Hello
```

A configured input that did not emit a value becomes empty text. A placeholder that does not match a configured input remains unchanged.

### Plug-in templates

Plug-in nodes can define their own template fields. Depending on the plug-in, these may expose:

- `{{input}}` for the primary input
- `{{inputs.portName}}` for a named input port
- `{{config.fieldName}}` for node configuration
- Values supplied in the plug-in execution context
- Values supplied by bundled files

Consult the plug-in's own documentation because its available fields are defined by that plug-in. Missing plug-in template values normally become empty strings.

Workflow-wide tokens are expanded in a plug-in node's configured field values. A template bundled inside the plug-in definition uses the plug-in's own interpolation context instead, so do not assume that workflow-wide tokens are available inside that template unless the plug-in explicitly exposes them.

## Precedence and name collisions

Workflow-wide expansion happens before node-local interpolation. This lets a template mix both kinds of token:

```text
Report for {{date}}: {{value.summary}}
```

The workflow runner first replaces `{{date}}`. It preserves `{{value.summary}}`, and the Transform node then replaces that placeholder from its input.

Avoid giving a Math or Join input the same name as a workflow-wide token. For example, a Join variable named `date` cannot be referenced with `{{date}}`, because the workflow runner replaces it with the current date before the Join node sees the template. Rename a Math input to something such as `record_date`, or a Join input to `record-date` or `record_date`.

## Troubleshooting

If a token remains visible in the result:

1. Check its spelling against the workflow-wide token table or the node's configured variable names.
2. Confirm that it is used in a configured workflow field, rather than arriving inside dynamically generated runtime data.
3. For a node-local token, confirm that the relevant operation is selected, such as **Template** on Transform or Join.
4. For dot paths, confirm that every property exists in the input value.

If a node-local variable unexpectedly becomes a date, time, session value, or workflow name, rename it to avoid a workflow-wide token collision.
