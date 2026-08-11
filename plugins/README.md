# Magic Conch plug-ins

Plug-ins are JSON manifests installed from **Settings → Plug-ins**. An installed plug-in can add one or more custom nodes to the node library.

Each node type must be namespaced with the plug-in id, for example `text-tools:template`.

## ComfyUI-style node contract

Nodes declare `inputTypes.required`, `inputTypes.optional`, `returnTypes`, `returnNames`, `category`, and `functionName`. Magic Conch adds the execution-flow socket automatically. Port types are matched before a connection is accepted.

Supported core types are `FLOW`, `PROMPT`, `FILES`, `TEXT`, `NUMBER`, `BOOLEAN`, and `ANY`. Unknown custom types are treated as `ANY` for compatibility.

## Executors

- `template` interpolates `{{input}}`, `{{config.fieldName}}`, and workflow context values.
- `http` sends `{ input, config, context }` as JSON to a GET or POST URL.
- `javascript` runs an asynchronous function body with `input`, `inputs`, `config`, and `context` arguments. Return an object keyed by `returnNames`, an array matching `returnTypes`, or a single value for the first output.

JavaScript plug-ins run with the same local access as Magic Conch. Only install manifests you trust.

See [`examples/text-tools.plugin.json`](../examples/text-tools.plugin.json) for a complete example.
