# Modeling Lab and SysML Engineering Workbench

The maintained **[Modeling Lab](https://haitaowu12.github.io/sysmlv2_viewer/)** runs directly in the browser. Open the link, allow the modeling runtime to initialize, and choose Engineering or Stakeholder. It works from static GitHub Pages assets without a companion service or local installation.

Use **Open model** to select your own SysML v2 `.sysml` files, a source folder, or an editable `.modeling.json` project. A unique source-owned starting component opens directly; ambiguous models offer a starting-point choice. Valid source can be retained and edited even when a diagram is unsupported. Authored SysML view declarations remain in source; Lab views are generated projections. **Develop model** offers bounded guided changes; **Review changes** shows their basis and consequences before applying. Save the editable project file and keep your downloaded copy. **Export reader review** produces a frozen HTML review for sharing. Files are processed in the browser; this application does not provide shared accounts or cloud project storage.

The current import format is **SysML v2 text**. SysML 1/XMI and vendor binary project files are not supported. Successful language validation does not mean every construct has a supported diagram; unsupported projections are reported explicitly.

The [own-model workflow repair](docs/own-model-repair-2026-10-15.md) records current opening behavior, independent source trials and remaining coverage gaps.

The [completion and qualification record](docs/browser-only-lab-review-2026-10-14.md) records preserved views, recovery behavior, fixture results, scale measurements and known limits. The browser profile uses the maintained Lab interface and projections with a pinned OpenSysML WASM engine. It does not claim full Pilot notation/language parity or engineering acceptance. The [artifact release process](experiments/browser-only-lab/RELEASE.md) explains exact-byte promotion and retained rollback.

The `modeling-lab/` directory is a generated mirror of the maintained standalone package. Change the maintained owner first and regenerate its registered mirror; avoid separate UI implementations. The earlier native baseline remains available in Releases.

## Earlier service-backed workbench

The service-backed workbench source and its staged implementation record below remain in this repository as a separate preserved development surface. Its companion, desktop and service requirements do not apply to the browser-only Lab linked above.

## Earlier workbench implementation record

Gates P1-P6 provide:

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

The Phase 3 command boundary includes:

- versioned command registry and command envelopes;
- mandatory base snapshot/document hashes;
- deterministic workspace edits with overlap, range, and scope rejection;
- exact inverse edits and validated undo/redo transactions;
- rename plus bounded create/delete/move/type/multiplicity/property,
  documentation, relationship, and versioned-pattern source profiles;
- protocol, service, client SDK, and native structural/interconnection command
  review components;
- command-id idempotency conflicts;
- authoritative overlay diagnostics and semantic diff;
- explicit human approval before crash-consistent multi-file commit;
- durable audit metadata, recovery journals, external-writer conflict detection,
  and startup recovery;
- canonical source remains unchanged before approval.

The Phase 4 product-shell component now adds:

- the service-backed workbench as the primary local application route;
- Explorer, Model, Diagrams, Traceability, Interfaces, Verification, Reviews,
  Changes, Reports, and Settings activities;
- containment, type, dependency, neighbourhood, requirements, verification,
  and interface explorer modes;
- source, semantic diagram, matrix, inspector, Problems, saved-view, and
  command-palette surfaces;
- Monaco completion, hover, definition, references, and formatting delegated
  to the language service;
- source drafts that become validated `replace-document` command proposals and
  cannot write before explicit human approval;
- workspace-owned saved views and stable-identity layout positions.

Phase 5 adds the qualified engineering-assurance workflow:

- deterministic requirements, verification, and interface rule packs;
- Git status, workspace-owned baseline manifests, and stable-identity semantic
  comparison;
- model-anchored reviews with explicit dispositions, history, and stale-anchor
  detection;
- reproducible, sanitized HTML and byte-deterministic PDF reports, with CSV
  exports for registers;
- operational Interfaces, Verification, Changes, Reviews, and Reports
  workbench surfaces;
- a realistic four-document infrastructure pilot with two Git baselines, an
  approved source-backed interface edit, a completed review cycle, and
  generated evidence.

Phase 6 adds the controlled-assistant boundary:

- twelve narrow semantic/model tools and no raw repository access;
- stable-identity citation validation and rejection of invented references;
- typed command proposals with source edits, diagnostics, affected identities,
  semantic diff, and no provider-side apply;
- a separate user-only approval operation that safely revalidates after
  workspace restart;
- tamper-evident, diffable local AI audit records;
- offline deterministic search/rename fallback with provider networking
  disabled;
- an Assistant patch-review surface with explicit network state;
- removal of the legacy whole-document AI implementation and `410 Gone`
  retirement responses.

Phase 7 technical work now adds:

- same-origin static UI delivery from the authenticated loopback service with
  strict CSP, Host checking, traversal rejection, and immutable asset caching;
- deterministic exact-runtime bundle assembly, embedded whole-bundle
  verification, complete runtime/npm notices, and a copied-bundle offline
  smoke;
- release-source and fail-closed production verification commands;
- automated serious/critical accessibility checks, command-palette focus
  containment, reduced-motion and visible-focus behavior;
- refreshed performance instrumentation with warmups, p95 distributions, and
  all mandated medium-workspace targets;
- current workspace, installation, recovery, migration, architecture,
  security, troubleshooting, and release documentation.

Before the browser-only Lab replacement, Pages hosted the service-backed
workbench shell. That predecessor offered a bounded evaluation mode and a
paired local-companion mode. Its opaque workspace handles, local evidence
storage and `?legacy=1` compatibility viewer belonged to that earlier profile.
They are retained in the source and rollback artifact; they are not routes or
features of the live Modeling Lab.

For the earlier service-backed profile, unqualified production claims include: complete notation-specific graphical
mutation, external AI-provider adapters, signed desktop installers, Windows
qualification, or remote collaboration. That profile's P7 release remains blocked by
product/runtime license reconciliation, signed/notarized distribution,
clean-machine evidence for every claimed OS, and three-user usability evidence.

## Earlier workbench development

```bash
npm ci
npm run verify:release:source
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
npm run qualify:phase3
npm run qualify:phase4
npm run qualify:phase5
npm run qualify:phase6
npm run benchmark:workbench -- \
  --candidate qualified-hybrid --profile medium --repetitions 1
```

The retained `workbench:companion` and `start-pages-companion` launchers were
written for the predecessor Pages shell. The live browser-only Lab does not
consume their pairing fragment or connect to that service. Do not use those
launchers as the current Lab entry. The predecessor bundle's Node/Java,
per-OS packaging and runtime qualification limits remain attached to that
separate historical profile.

## Authority and evidence

- language decision: `docs/adr/ADR-001-language-reference-and-runtime-engine-selection.md`;
- identity model: `docs/adr/ADR-002-model-identity.md`;
- Phase 2 gate record: `docs/revamp/19-phase2-semantic-core-status.md`;
- Phase 3 execution plan: `docs/revamp/20-phase3-command-editing-plan.md`;
- Phase 3 gate candidate: `docs/revamp/21-phase3-gate-decision.md`;
- Phase 4 component status: `docs/revamp/23-phase4-product-shell-status.md`;
- Phase 5 gate decision: `docs/revamp/25-phase5-gate-decision.md`;
- Phase 6 safety contract: `docs/architecture/controlled-ai.md`;
- Phase 6 gate decision: `docs/revamp/27-phase6-gate-decision.md`;
- exact runtime observation: `docs/revamp/phase2-qualification-observation.json`;
- exact Phase 3 command observation:
  `docs/revamp/phase3-qualification-observation.json`;
- Phase 4 component observation:
  `docs/revamp/phase4-qualification-observation.json`;
- integrated Phase 5 observation:
  `docs/revamp/phase5-qualification-observation.json`;
- controlled Phase 6 observation:
  `docs/revamp/phase6-qualification-observation.json`;
- medium benchmark: `docs/revamp/phase2-benchmark-observation.json`;
- mandatory golden: `fixtures/language/golden/phase2-semantic-evidence.json`.

No broad “supports SysML v2” claim is made. Capability boundaries are in
`docs/revamp/05-capability-matrix.md` and must remain linked to tests.

## Security posture

The workbench service authorizes workspace roots, rejects path traversal and
symlink-backed model/identity paths, binds shared access to authenticated
loopback transport, and keeps source local. Provider-backed AI is not part of
the authority path and cannot mutate canonical source. Phase 3 commands require
an explicit, validated human approval transaction.

The project is not yet a public production release. The portable macOS arm64
artifact is an unsigned internal release candidate only; the open P7 gates
above remain mandatory.
