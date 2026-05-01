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
npm run lint
npm run test
npm run build
npm audit --omit=dev
```

Bridge changes need roundtrip coverage: SysML to semantic to Draw.io to semantic to SysML. Parser changes need syntax and recovery tests. Store changes need undo/redo and sync-state tests.

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

## Implementation Rules

- Keep TypeScript strict and avoid broad untyped node access.
- Treat SysML source as canonical; preserve layout separately where possible.
- Keep Draw.io messaging origin-scoped to `https://embed.diagrams.net`.
- Keep app UI dense, restrained, and workspace-first.
- Do not expose the local API server publicly without adding authentication and deployment hardening.
