# Phase 4 Product Shell Status

Status: component qualification passed; Gate P4 remains open  
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

- `npm run test:workbench`: 14 files, 58 tests passed.
- `npm test`: 34 files and 211 tests passed; 19 optional upstream-corpus tests
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
  `docs/revamp/phase4-qualification-observation.json`.

## Gate disposition

The product-shell component is qualified. Gate P4 is not yet declared complete
because its mandated usability pilot includes three workflows whose authority
belongs to Phase 5:

1. compare two Git baselines semantically;
2. record and close a model-anchored review finding;
3. export an interface assurance report.

Calling Gate P4 complete before those tasks exist would redefine the acceptance
gate downward. Phase 5 will be implemented as a stacked branch from this exact
head. The integrated eight-task pilot will then qualify both Gate P4 usability
and Gate P5 assurance before either PR is made ready.

## Next slice

1. Git repository/baseline service and semantic comparison.
2. Model-anchored review persistence and stale-finding detection.
3. Requirement/verification and interface rule packs.
4. Deterministic interface and closure reports.
5. Integrated browser usability pilot using a copied infrastructure workspace.
