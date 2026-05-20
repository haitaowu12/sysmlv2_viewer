# SysML Viewer Developer Guide

## Architecture

| Layer | Technology | Role |
|-------|------------|------|
| UI | React 19 + TypeScript | App shell, panels, modals, diagram views |
| State | Zustand | Source, parsed model, view state, undo/redo, sync state |
| Diagrams | React Flow | Interactive canvas, nodes, edges, controls, minimap |
| Editor | Monaco | SysML source editing, syntax highlighting, diagnostics |
| Layout | Dagre + custom routing | Hierarchical layout and orthogonal edge routing |
| Bridge | Local semantic model | SysML, Draw.io, SVG, and patch synchronization |
| API | Node HTTP server | AI generation/edit endpoints and Draw.io validation |
| Tests | Vitest | Parser, bridge, store, UI behavior, and server config |

Source text is canonical. Diagrams and Draw.io XML are derived from parsed SysML, then synced back through semantic diffs and safety-classified patches.

Use `docs/r2-product-contract.md` as the product boundary for R2 claims. New parser, bridge, AI, or deployment work should update that contract when support status changes.

## Data Flow

1. `parseSysML(sourceCode)` builds an AST with recoverable diagnostics.
2. `buildSemanticModelFromSource()` flattens AST nodes and relationships into a graph.
3. `autoLayout()` or semantic layout maps place nodes.
4. React Flow renders live views; bridge serializers emit Draw.io XML and SVG.
5. Draw.io changes are parsed, diffed, and applied as safe or review-required patches.

## API And AI

Existing endpoints:

- `GET /api/health`
- `POST /api/ai/generate-model`
- `POST /api/ai/edit-model`
- `POST /api/validate/drawio`

Browser payloads do not include provider API keys. The server reads:

- `SYSML_AI_PROVIDER`
- `SYSML_AI_MODEL`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GOOGLE_API_KEY`
- `CORS_ORIGIN`

If no matching provider key exists, generation/editing falls back to local heuristics.

## Production Gates

Run these before shipping:

```bash
npm ci
npm run lint
npm run test
npm run test:release
npm run build
npm audit --omit=dev
```

Bridge changes need roundtrip coverage: SysML to semantic to Draw.io to semantic to SysML. Parser changes need syntax and recovery tests. Store changes need undo/redo and sync-state tests.

`npm run test:release` must always pass for in-repo release baseline tests. Upstream corpus fixtures are optional in CI and run only when `SYSML_V2_RELEASE_DIR` points to a local `Systems-Modeling/SysML-v2-Release` checkout.

## SysML v2 Release Baseline

Use `docs/sysml-v2-release-baseline.md` as the source anchor for parser and example work. Current baseline:

- `Systems-Modeling/SysML-v2-Release`
- tag `2026-04`
- commit `9baca5908ca28b53da085de69336fde48420ea8f`

Parser changes should start from release `bnf/` and add focused tests. When a local release checkout is available, run:

```bash
SYSML_V2_RELEASE_DIR=/path/to/SysML-v2-Release npm run test:release
```

Do not expand visual roundtrip claims until the release fixture gate and screenshot QA pass.

## Key Files

| Concern | File |
|---------|------|
| Root app | `src/App.tsx` |
| Store | `src/store/store.ts` |
| Parser/types | `src/parser/parser.ts`, `src/parser/types.ts` |
| Semantic bridge | `src/bridge/` |
| Diagram views | `src/views/` |
| Shared diagram shell | `src/components/DiagramView.tsx` |
| AI panel | `src/components/AiChatPanel.tsx` |
| API server | `server/` |
| Tests | `src/test/`, `server/*.test.js` |
| Release baseline | `docs/sysml-v2-release-baseline.md`, `src/test/upstreamCorpus.test.ts` |

## Implementation Rules

- Keep TypeScript strict and avoid broad untyped node access.
- Treat SysML source as canonical; preserve layout separately where possible.
- Keep Draw.io messaging origin-scoped to `https://embed.diagrams.net`.
- Keep app UI dense, restrained, and workspace-first.
- Do not expose the local API server publicly without adding authentication and deployment hardening.
- Keep README and user docs aligned to `docs/r2-product-contract.md`; do not expand support claims without tests.
