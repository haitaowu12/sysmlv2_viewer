# SysML Engineering Workbench

Local-first SysML v2 engineering workbench under staged architectural revamp.
SysML/KerML source is canonical. The production path is a workspace service
backed by a locked, qualified language-engine runtime.

## Current implemented state

Phase 2 provides:

- multi-file workspace loading and configured libraries;
- locked VinQut/Pilot semantic authority plus non-authoritative Spec42
  authoring assistance;
- deterministic diagnostics and standard LSP navigation operations;
- explicit Pilot EMF semantic evidence with no legacy-parser fallback;
- normalized elements and containment, typing, dependency, satisfaction,
  verification, connection, flow, and interface relationships;
- durable identity registry with aliases, tombstones, reconciliation receipts,
  conflict failure, and backup recovery;
- bounded containment, type, dependency, neighbourhood, requirements,
  verification, and interface queries;
- an explorer projection built only from the normalized snapshot;
- identity-aware rename/move semantic diff classification.

The existing Vite viewer remains a compatibility/demo surface during the
revamp. Its hand-written parser, fixed diagram tabs, Draw.io round trip, and
browser store are not authoritative workbench architecture. They will be
retired or isolated in later gated phases.

Not yet implemented as production workbench claims: typed source-edit
commands, native graphical mutation, the new application shell, assurance
workflows, review persistence, Git baseline UI, deterministic reports,
controlled AI, desktop packaging, or release-candidate hardening.

## Development

```bash
npm install
npm run verify:phase2
```

Run the service without a configured engine in preservation-control mode:

```bash
npm run build:workbench
npm run workbench:service -- --stdio --workspace-root /authorized/root
```

The qualified hybrid requires the exact runtime artifacts and environment
bindings in `config/language-engine-runtime-lock.json`. With those configured:

```bash
npm run qualify:phase2
npm run benchmark:workbench -- \
  --candidate qualified-hybrid --profile medium --repetitions 1
```

## Authority and evidence

- language decision: `docs/adr/ADR-001-language-reference-and-runtime-engine-selection.md`;
- identity model: `docs/adr/ADR-002-model-identity.md`;
- Phase 2 gate record: `docs/revamp/19-phase2-semantic-core-status.md`;
- exact runtime observation: `docs/revamp/phase2-qualification-observation.json`;
- medium benchmark: `docs/revamp/phase2-benchmark-observation.json`;
- mandatory golden: `fixtures/language/golden/phase2-semantic-evidence.json`.

No broad “supports SysML v2” claim is made. Capability boundaries are in
`docs/revamp/05-capability-matrix.md` and must remain linked to tests.

## Security posture

The workbench service authorizes workspace roots, rejects path traversal and
symlink-backed model/identity paths, binds shared access to authenticated
loopback transport, and keeps source local. Provider-backed AI is not part of
the Phase 2 authority path and cannot mutate canonical source.

The project is not yet a production release. Gate P7 remains required.
