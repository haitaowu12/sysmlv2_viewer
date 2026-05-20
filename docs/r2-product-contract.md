# SysML Viewer R2 Product Contract

## Mission

SysML Viewer R2 is a private/local SysML v2 workspace for reading, editing, visualizing, and exchanging a practical subset of textual SysML. The source text remains canonical. Diagrams, Draw.io XML, SVG, PNG, model explorer state, and AI-assisted edits are derived from or applied back to that source through explicit parser and bridge logic.

R2 should be useful for systems-engineering review, lightweight model authoring, requirement/verification trace exploration, and fixture-driven parser growth. It is not a complete SysML v2 modeling environment.

## Non-Goals

- Full OMG SysML v2 language, KerML, or XMI implementation.
- Normative validation equivalent to the official SysML v2 toolchain.
- Multi-user collaboration, model repository management, or access control.
- Public hosted AI/API service.
- Guaranteed lossless roundtrip for arbitrary Draw.io diagrams.
- Complete graphical notation coverage for every SysML v2 concept.

## Support Boundaries

### Supported

These areas are expected to work for normal R2 workflows and should have focused tests when changed:

- Text-first editing of supported SysML v2 subset.
- Live parse diagnostics with recovery where possible.
- General, Interconnection, Action Flow, State Transition, Requirements, Viewpoints, and Draw.io views for supported model elements.
- Import/export for `.sysml`, `.drawio`, `.svg`, and `.png`.
- SysML to semantic model to diagram rendering for supported elements.
- Safe structural Draw.io synchronization for the supported bridge subset.
- Local/API-backed AI generation and editing with server-held provider keys.
- Local heuristic AI fallback when no provider key is configured.

### Partial

These areas are allowed, but claims must stay limited until fixture coverage and visual QA expand:

- Broader SysML v2 release fixture parsing.
- Recovery for unsupported syntax while keeping the source editable.
- Roundtrip preservation for layout, comments, formatting, and unsupported statements.
- Rich metadata, analysis, verification, viewpoint, and requirement variants beyond current tests.
- Draw.io edits that require review before patch application.
- Screenshot or visual regression checks beyond current build/test gates.

### Unsupported

These areas must not be described as production-ready in R2:

- Full SysML v2 grammar coverage.
- Full KerML coverage.
- Public API deployment without authentication and operational controls.
- Browser-held AI provider keys.
- Collaborative editing or shared model persistence.
- Arbitrary Draw.io diagram import as semantically valid SysML.
- Official conformance certification.

## Production-Grade Acceptance Criteria

R2 production-grade means the deployed artifact and documented workflows are reliable inside the supported boundary, not that every SysML v2 feature is implemented.

Required gate before release/deploy:

- `npm ci`
- `npm run lint`
- `npm run test`
- `npm run test:release`
- `npm run build`
- `npm audit --omit=dev`

Release test policy:

- `npm run test:release` always runs the in-repo release baseline tests.
- Upstream corpus tests run only when `SYSML_V2_RELEASE_DIR` points to a local `Systems-Modeling/SysML-v2-Release` checkout.
- Skipping the upstream corpus is acceptable for GitHub Pages CI because the corpus is not vendored in this repository.
- Any parser, bridge, or example claim expanded beyond the current subset should include matching release fixture coverage before being documented as supported.

Required documentation standard:

- User-facing docs must name supported, partial, and unsupported boundaries.
- README claims must link back to this contract and avoid implying full SysML v2 conformance.
- Developer docs must keep the release baseline and product contract aligned.

## Workflows

### Local Static App

Use for source editing, diagram inspection, import/export, and local heuristic AI fallback:

```bash
npm ci
npm run dev
```

Open the Vite URL, normally `http://localhost:5173/sysmlv2_viewer/`.

### Local API-Enabled App

Use when provider-backed AI generation/editing or Draw.io validation API endpoints are needed:

```bash
npm run dev
npm run dev:api
```

Configure provider keys on the server process only:

```bash
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
GOOGLE_API_KEY=...
SYSML_AI_PROVIDER=openai
SYSML_AI_MODEL=gpt-4.1-mini
CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173
```

### Release Verification

Run the standard gate:

```bash
npm run lint
npm run test
npm run test:release
npm run build
npm audit --omit=dev
```

Run optional upstream corpus coverage when a local release checkout exists:

```bash
SYSML_V2_RELEASE_DIR=/path/to/SysML-v2-Release npm run test:release
```

## Deployment Model

### GitHub Pages Static Deployment

GitHub Pages deploys only the built static app from `dist/`.

Static Pages deployment supports:

- Loading and editing local SysML source.
- Rendering supported diagrams.
- Import/export handled in the browser.
- Documentation and baseline examples bundled into the app.

Static Pages deployment does not provide:

- Node API endpoints.
- Server-held AI provider keys.
- Provider-backed AI calls.
- Public model storage or collaboration.

### API-Enabled Deployment

The Node API server is a separate deployment concern. It may be run locally for development and private use. Exposing it beyond a trusted local/private environment requires authentication, CORS review, rate limits, logging policy, secret management, and operational monitoring before it can be treated as production-ready.
