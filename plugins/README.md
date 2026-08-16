# Magic Conch plug-ins

Plug-ins are JSON manifests or ZIP bundles installed from **Settings → Plug-ins**. An installed plug-in can add one or more custom nodes to the node library.

## Bundled files

A plug-in ZIP contains a manifest named `plugin.json` and may contain any number of supporting files under `files/`:

```text
plugin.json
files/
  scripts/run.js
  templates/prompt.txt
  icon.svg
```

Files under `files/` are discovered automatically. A manifest may instead list
them explicitly with `name`, `path`, and `type` fields in a top-level `files`
array. Installed files are stored locally with the plug-in.

A JavaScript or template executor can load its source directly from the bundle:

```json
{
  "kind": "javascript",
  "file": "scripts/run.js"
}
```

Bundled files are also available to JavaScript executors through the fifth
`files` argument. Each entry contains `name`, `type`, `size`, and a `data` URL.
HTTP POST executors receive the same array in the JSON request body.

Each node type must be namespaced with the plug-in id, for example `text-tools:template`.

## ComfyUI-style node contract

Nodes declare `inputTypes.required`, `inputTypes.optional`, `returnTypes`, `returnNames`, `category`, and `functionName`. Magic Conch adds the execution-flow socket automatically. Port types are matched before a connection is accepted.

Supported core types are `FLOW`, `PROMPT`, `FILES`, `TEXT`, `NUMBER`, `BOOLEAN`, and `ANY`. Unknown custom types are treated as `ANY` for compatibility.

## Executors

- `template` interpolates `{{input}}`, `{{config.fieldName}}`, workflow context values, and bundled file values. The template may be inline or selected with `file`.
- `http` sends `{ input, inputs, config, context, files }` as JSON to a POST URL. GET executors continue to interpolate their URL without a request body.
- `javascript` runs an asynchronous function body with `input`, `inputs`, `config`, `context`, and `files` arguments. Code may be inline or selected with `file`. Return an object keyed by `returnNames`, an array matching `returnTypes`, or a single value for the first output.

JavaScript plug-ins run with the same local access as Magic Conch. Only install manifests you trust.

See [`examples/text-tools.plugin.json`](../examples/text-tools.plugin.json) for a complete example.
