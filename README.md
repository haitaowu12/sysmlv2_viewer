# SysML Engineering Workbench

Recovery status: **pre-alpha technical foundation; not a production release**

SysML/KerML source is canonical. The repository retains a transport-neutral
Workbench Service, Protocol, Client SDK, language adapter, semantic evidence,
identity, typed-command, assurance, and security foundation. The former Phase 4
and Phase 5 product-gate claims have been invalidated because their evidence
bypassed the delivered UI.

The active recovery authorities are:

- `docs/revamp/36-failed-attempt-postmortem.md`
- `docs/revamp/37-recovery-acceptance-contract.md`
- `docs/revamp/38-codex-recovery-execution-handoff.md`

## Release truth

- P1-P3 remain technical foundation evidence, subject to recovery
  requalification.
- P4 is invalidated as a product gate.
- P5 is invalidated as a product gate.
- P6 retains service-level safety evidence; its product-gate status is
  withdrawn.
- P7 and release progression remain blocked.
- No public production, release-candidate product, Windows, hosted
  collaboration, or complete SysML v2 notation claim is made.

The existing `0.7.0-rc.1` package identifier is historical compatibility
metadata. It does not indicate product release readiness.

## Retained technical capabilities

The repository contains implemented and tested foundations for:

- configured multi-file workspaces and official libraries;
- locked VinQut/Pilot semantic authority with a product-owned evidence
  extension;
- diagnostics, symbols, definition, references, hover, and bounded authoring
  assistance;
- normalized source-backed elements and containment, typing, dependency,
  satisfaction, verification, connection, flow, and interface relationships;
- stable identity, reconciliation, tombstones, recovery, and semantic diff;
- bounded queries over the normalized snapshot;
- typed commands, explicit source edits, authoritative validation, approval,
  crash-consistent apply, audit, undo, and recovery;
- deterministic rule evaluation;
- Git-backed baselines when Git is available;
- model-anchored review and report service schemas;
- loopback pairing, origin controls, opaque workspace handles, and packaged
  runtime integrity checks;
- bounded AI/tool proposal safety mechanisms at the service layer.

These capabilities do not by themselves prove a usable authoring product.

## Recovery UI boundary

The current shared web shell is a recovery/evaluation client:

- the Pages profile does not expose source authoring until Monaco and its
  workers pass exact-artifact CSP/offline qualification;
- the current card grid is labelled an **element map**, not a SysML diagram;
- the current table is labelled an **element inventory**, not an engineering
  matrix;
- generic dropdown graphical editing is not a product capability;
- Interfaces and Verification remain available when Git is unavailable;
- Git baseline controls are disabled with an explicit capability message.

The retained viewer at `?legacy=1` is a regression and rendering reference. Its
parser and browser store are not authoritative.

## Recovery target

The recovery contract selects a VS Code-first authoring shell backed by the
existing service and protocol. The first practitioner slice is a bounded
OMC4/SCADA-style interface workflow:

1. open multi-file source;
2. diagnose and navigate through the required language authority;
3. render a source-backed Interconnection View;
4. create a port;
5. connect eligible ports;
6. create or change an item flow;
7. review and approve source edits;
8. undo and restart;
9. reproduce an interface register;
10. pass three independent practitioner runs.

AI expansion, broader diagrams, packaging expansion, and release promotion are
frozen until that slice passes.

## Development

Install and run the source baseline:

```bash
npm ci
npm run verify:gate-truth
npm run lint
npm run test:workbench
npm test
npm run build
npm run audit:production
```

Run the retained service qualifiers:

```bash
npm run qualify:service-product-shell-foundation
npm run qualify:service-assurance-workflow
```

Compatibility aliases remain:

```bash
npm run qualify:phase4
npm run qualify:phase5
```

Their output is `service-integration` evidence. It is not UI, usability, or
practitioner evidence.

Run the service without a qualified runtime in preservation-control mode:

```bash
npm run build:workbench
npm run workbench:service -- --stdio --workspace-root /authorized/root
```

The exact qualified runtime requires the artifacts and environment bindings in
`config/language-engine-runtime-lock.json`. That historical hybrid lock remains
in place until the single-required-runtime recovery profile is rebuilt and
requalified.

## Pages recovery evaluation

The Pages shell may be paired with a local companion for technical evaluation:

```bash
npm run workbench:companion -- \
  --workspace-file /absolute/path/to/sysml-workspace.yaml
```

The companion binds to an operating-system-selected loopback port and opens a
short-lived pairing secret in the URL fragment. Canonical source, engines, Git,
reviews, and evidence remain local.

This path is not production authoring. The Pages profile must pass a real
browser exact-artifact test before any source or notation capability is
restored.

## Authority and evidence

- language authority decision:
  `docs/adr/ADR-001-language-reference-and-runtime-engine-selection.md`
- client/service boundary:
  `docs/adr/ADR-003-client-service-and-deployment-architecture.md`
- identity model: `docs/adr/ADR-002-model-identity.md`
- P4 correction: `docs/revamp/23-phase4-product-shell-status.md`
- P5 correction: `docs/revamp/25-phase5-gate-decision.md`
- P6 correction: `docs/revamp/27-phase6-gate-decision.md`
- incident record: `docs/revamp/36-failed-attempt-postmortem.md`
- recovery contract: `docs/revamp/37-recovery-acceptance-contract.md`
- Codex execution handoff:
  `docs/revamp/38-codex-recovery-execution-handoff.md`
- supported language boundary: `docs/revamp/05-capability-matrix.md`

Historical machine-readable Phase 4-6 observations remain in
`docs/revamp/`. Their active gate classification is governed by the corrected
status documents.

## Security posture

The Workbench Service authorizes roots, rejects path traversal and unsafe
identity paths, binds shared access to authenticated loopback transport, and
keeps source local. Provider-backed AI is outside the authority path. Source
mutation requires a validated typed command and explicit user approval.

The project is not approved for public binary distribution. Issue #10 remains
open.
