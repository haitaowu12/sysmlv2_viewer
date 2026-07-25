# Phase 4 Product Shell Status

Status: Gate P4 passed through the integrated Phase 5 pilot
Branch: `codex/sysml-workbench-phase4-product-shell`
Draft PR: #6

## Delivered

- The service-backed SysML Engineering Workbench is the primary local route.
- The former viewer is isolated behind `?legacy=1` and is the explicit
  read-only GitHub Pages compatibility profile.
- The shell implements the activity rail, model explorer, source, diagram,
  matrix, inspector, Problems, saved views, command palette, and local-service
  connection experience.
- Explorer modes use bounded workspace-service queries for containment, type,
  dependencies, neighbourhood, requirements, verification, and interfaces.
- Monaco completion, hover, definition, references, and formatting delegate to
  the language authority. Monaco does not parse SysML for application state.
- Text edits remain drafts until they become a `replace-document` typed
  command, pass authoritative validation, show source edits and semantic diff,
  and receive explicit human approval.
- Saved view definitions and stable-identity layout positions are written as
  bounded workspace-owned JSON. Browser storage is not authoritative.
- Native command edits refresh the semantic workspace after apply.

## Evidence

- `npm run test:workbench`: 18 files, 73 tests passed.
- `npm test`: 38 files and 227 tests passed; 19 optional upstream-corpus tests
  skipped because the optional corpus was not configured.
- `npm run build`: TypeScript, service distribution, and Vite production build
  passed.
- `npm audit --omit=dev`: zero production vulnerabilities.
- `npm run qualify:phase4`: qualified locked engines, copied fixture, seven
  projection modes, source read, durable view save/list, source-draft proposal,
  no write before approval, finalized apply, semantic identity cross-navigation,
  and byte-exact undo all passed.
- Browser pairing and workspace opening were exercised against the qualified
  loopback service. Rendered evidence is stored under `output/playwright/`.
- Machine-readable evidence:
  `docs/revamp/phase4-qualification-observation.json` and
  `docs/revamp/phase5-qualification-observation.json`.

## Gate disposition

Gate P4 passes. The integrated locked-runtime pilot exercises all eight
mandated tasks through the workbench service and product surfaces:

1. open the realistic four-document infrastructure workspace;
2. locate an unresolved reference while preserving canonical source;
3. navigate from a requirement into the semantic model;
4. identify four unverified requirements;
5. add an interface through a typed command with no pre-approval write;
6. compare two Git baselines semantically;
7. close a stable-identity-anchored review finding with no stale anchor;
8. export a deterministic HTML/PDF/CSV interface register.

The exact qualified implementation head is `8a69813`. The semantic authority
artifact SHA-256 is
`8dc941e0e83fbdd063ee2e9148840fa2d5b80ad72f27d22c8267e61db52a5160`.
The pilot result is machine-recorded as `pass`.

## Next slice

Gate P5 closure and controlled-AI Gate P6. The project remains a release
candidate under construction; Gate P7 packaging, security, accessibility, and
clean-machine evidence are still required before any production claim.
