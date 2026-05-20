# SysML Viewer User Guide

## Workspace

SysML Viewer combines a source editor, live diagram canvas, model explorer, component library, properties inspector, Draw.io bridge, and AI assistant.

The SysML source is the primary model. Diagram views update from the source and selected visual edits are converted back into source patches.

## Views

- **General** - package, part, port, item, and definition structure.
- **Interconnection** - internal parts, ports, connections, flows, and bindings.
- **Action Flow** - actions, inputs, outputs, flows, and bindings.
- **State Transition** - states, entry transitions, and transition labels.
- **Requirements** - requirements, docs, attributes, satisfy, verify, and derive links.
- **Viewpoints** - viewpoints, views, concerns, and conformance links.
- **Draw.io** - embedded diagrams.net bridge plus advanced XML fallback.

## Import And Export

Use the toolbar open button or drag a file into the app.

Supported import formats:

- `.sysml` - SysML v2 source.
- `.drawio` - Draw.io XML translated through the semantic bridge.

Supported export formats:

- `.sysml` - canonical text source.
- `.drawio` - diagrams.net XML.
- `.svg` - static diagram export.
- `.png` - rasterized SVG export.

## AI Assistant

AI provider keys are configured on the local API server, not in the browser.

Available modes:

- **Local Heuristic** - no key required.
- **OpenAI Server Key** - uses `OPENAI_API_KEY`.
- **Anthropic Server Key** - uses `ANTHROPIC_API_KEY`.
- **Google Server Key** - uses `GOOGLE_API_KEY`.

If a selected provider has no configured key, the server falls back to local generation and reports that in diagnostics.

## Draw.io Bridge

The Draw.io tab loads diagrams.net in a sandboxed iframe and only accepts messages from `https://embed.diagrams.net`.

Workflow:

1. Pick a Draw.io view mode.
2. Regenerate from SysML or reflow layout when needed.
3. Edit in the Draw.io frame.
4. Review queued patches if changes are not safe to auto-apply.

If the iframe cannot load, use the advanced XML editor fallback.

## Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + Z` | Undo |
| `Cmd/Ctrl + Shift + Z` | Redo |
| `Cmd/Ctrl + B` | Toggle Explorer |
| `Cmd/Ctrl + J` | Toggle Properties |
| `Cmd/Ctrl + Shift + D` | Open Draw.io |
| `Cmd/Ctrl + Shift + I` | Open AI Chat |
| `Cmd/Ctrl + /` | Keyboard shortcuts |
| `Delete` / `Backspace` | Delete selected node |
| `Escape` | Clear focus or close modal |

## Supported SysML Subset

Best-supported roundtrip elements: `Package`, `PartDef`, `PartUsage`, `PortDef`, `PortUsage`, `ConnectionUsage`, `RequirementDef`, `RequirementUsage`, `VerificationDef`, `VerificationUsage`, `satisfy`, and `verify`.

Project examples and AI generation are anchored to `Systems-Modeling/SysML-v2-Release` tag `2026-04`, commit `9baca5908ca28b53da085de69336fde48420ea8f`.

Unsupported or partial syntax can still be edited as source, but may not render or roundtrip visually. Current partial areas include `alias`, `calc`, `individual`, `occurrence`, and `variation`.
