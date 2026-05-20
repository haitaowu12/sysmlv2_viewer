# SysML Viewer

Private/local SysML v2 visual editor with synchronized text, diagram, Draw.io, SVG, and AI-assisted modeling workflows.

Built by [Tony Wu](https://haitaowu12.github.io/tony-wu-home/) - systems engineering tools, assurance workflows, and learning simulations.

## Features

- SysML v2 text editor with live parsing and diagnostics.
- Diagram views for General, Interconnection, Action Flow, State Transition, Requirements, Viewpoints, and Draw.io.
- Import/export for `.sysml`, `.drawio`, `.svg`, and `.png`.
- Bidirectional SysML v2 to Draw.io synchronization for the supported structural subset.
- Local AI API with server-held provider keys and local heuristic fallback.
- Undo/redo, panel resizing, dark/light theme, keyboard shortcuts, and component library insertion.

## Quickstart

```bash
npm install
npm run dev
```

Open the Vite URL, normally `http://localhost:5173/sysmlv2_viewer/`.

For the standalone API server:

```bash
npm run dev:api
```

## AI Configuration

Browser requests never send provider API keys. Configure keys on the local API server:

```bash
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
GOOGLE_API_KEY=...
SYSML_AI_PROVIDER=openai
SYSML_AI_MODEL=gpt-4.1-mini
CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173
```

If no provider key is configured, AI generation falls back to the local heuristic generator.

## Scripts

- `npm run dev` - Vite development app with the local API plugin.
- `npm run dev:api` - standalone Node API server on `PORT` or `8787`.
- `npm run build` - TypeScript and production Vite build.
- `npm run lint` - ESLint production gate.
- `npm run test` - Vitest suite.
- `npm run test:release` - release-baseline and optional upstream fixture smoke tests.
- `npm run preview` - serve the production build.

## SysML v2 Release Baseline

Project examples, AI generation guardrails, and parser fixture work are anchored to:

- `Systems-Modeling/SysML-v2-Release`
- tag `2026-04`
- commit `9baca5908ca28b53da085de69336fde48420ea8f`

See `docs/sysml-v2-release-baseline.md`.

Optional upstream fixture check:

```bash
SYSML_V2_RELEASE_DIR=/path/to/SysML-v2-Release npm run test:release
```

## Security Notes

- Default CORS is restricted to local Vite/preview origins.
- AI provider keys are read from server environment variables only.
- Draw.io embed messaging is restricted to `https://embed.diagrams.net`.
- The app is intended for private/local use. Do not expose the API server publicly without adding authentication, request logging policy, and stricter deployment controls.

## Supported SysML Subset

Primary roundtrip coverage includes `Package`, `PartDef`, `PartUsage`, `PortDef`, `PortUsage`, `ConnectionUsage`, `RequirementDef`, `RequirementUsage`, `VerificationDef`, `VerificationUsage`, `satisfy`, and `verify`.

The parser intentionally recovers from unsupported syntax where possible so partial models remain inspectable. `alias`, `calc`, `individual`, `occurrence`, and `variation` are treated as partial/recovery-only areas until fixture-driven parser support is added.

## Troubleshooting

- Draw.io not loading: use the Draw.io tab's advanced XML editor fallback.
- AI provider call falls back locally: confirm the matching provider env key is present on the API server.
- Diagram appears offscreen after heavy edits: switch views or use the Draw.io reflow action.
- Import has parse errors: check the editor markers and status bar diagnostics.
