# SysML Viewer

Private/local SysML v2 visual editor for a practical supported subset, with synchronized text, diagram, Draw.io, SVG, and AI-assisted modeling workflows.

Built by [Tony Wu](https://haitaowu12.github.io/tony-wu-home/) - systems engineering tools, assurance workflows, and learning simulations.

## Features

- SysML v2 text editor with live parsing and diagnostics.
- Diagram views for General, Interconnection, Action Flow, State Transition, Requirements, Viewpoints, and Draw.io.
- Import/export for `.sysml`, `.drawio`, `.svg`, and `.png`.
- Bidirectional SysML v2 to Draw.io synchronization for the supported structural subset.
- Local AI API with server-held provider keys and local heuristic fallback.
- Undo/redo, panel resizing, dark/light theme, keyboard shortcuts, and component library insertion.

See `docs/r2-product-contract.md` for the R2 mission, non-goals, support boundaries, acceptance gates, and static vs API-enabled deployment model.

## Quickstart

```bash
npm install
npm run dev
```

Open the Vite URL, normally `http://localhost:5173/sysmlv2_viewer/`.

For the standalone local API server:

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
- `npm run test:release` - in-repo release baseline tests plus optional upstream fixture smoke tests when `SYSML_V2_RELEASE_DIR` is set.
- `npm run preview` - serve the production build.

## SysML v2 Release Baseline

Project examples, AI generation guardrails, and parser fixture work are anchored to:

- `Systems-Modeling/SysML-v2-Release`
- tag `2026-04`
- commit `9baca5908ca28b53da085de69336fde48420ea8f`

See `docs/sysml-v2-release-baseline.md` and `docs/webel-cameo-pilot-coverage.md`. Webel is used only as a non-authoritative visual coverage map; no Webel images or page bodies are vendored.

Optional upstream fixture check. CI may skip upstream corpus tests when the corpus checkout is absent; in-repo release baseline tests still run.

```bash
SYSML_V2_RELEASE_DIR=/path/to/SysML-v2-Release npm run test:release
```

## Security Notes

- Default CORS is restricted to local Vite/preview origins.
- AI provider keys are read from server environment variables only.
- Draw.io embed messaging is restricted to `https://embed.diagrams.net`.
- The app is intended for private/local use. Do not expose the API server publicly without adding authentication, request logging policy, and stricter deployment controls.
- GitHub Pages deploys the static app only. API-enabled/provider-backed AI use requires a separate trusted server.

## Supported SysML Subset

Primary roundtrip coverage includes `Package`, `PartDef`, `PartUsage`, `PortDef`, `PortUsage`, `ConnectionUsage`, `RequirementDef`, `RequirementUsage`, `VerificationDef`, `VerificationUsage`, `satisfy`, and `verify`.

The parser intentionally recovers from unsupported syntax where possible so partial models remain inspectable. `calc`, `individual`, `occurrence`, snapshots/time slices, `variation`/`variant`, metadata `about`, and message/event constructs are partial/recovery-only areas with explicit diagnostics until fixture-driven support is completed. `alias` has first-tranche parsing, but broader alias-aware reference resolution is still partial.

Unsupported areas include full SysML v2/KerML coverage, official conformance validation, public API hosting without hardening, and arbitrary Draw.io import as semantically valid SysML. See `docs/r2-product-contract.md`.

## Troubleshooting

- Draw.io not loading: use the Draw.io tab's advanced XML editor fallback.
- AI provider call falls back locally: confirm the matching provider env key is present on the API server.
- Diagram appears offscreen after heavy edits: switch views or use the Draw.io reflow action.
- Import has parse errors: check the editor markers and status bar diagnostics.
