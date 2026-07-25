# External Capability Review

Research cutoff: 2026-07-24. Runtime candidates are observations, not Phase 0 selections.

## Reference hierarchy

### Tier 1 — semantic and conformance reference

- [OMG SysML 2.0](https://www.omg.org/spec/SysML/), KerML 1.0, and [Systems Modeling API and Services 1.0](https://www.omg.org/sysml/sysmlv2/);
- adopted issue resolutions and formal specification artifacts;
- [official SysML v2 release](https://github.com/Systems-Modeling/SysML-v2-Release), standard libraries/KPARs, examples, notation material, and release notes.

Qualification pin: official release `2026-05`, commit `de1070ae8e79c21532b8004fc663d47b35d0e9fa`.

These sources define intended semantics and reproducible inputs. The workbench does not reinterpret the language from a third-party AST or current UI.

### Tier 2 — executable behavioral oracle

[Official Pilot implementation](https://github.com/Systems-Modeling/SysML-v2-Pilot-Implementation), matching tag commit `fa709f28dfd49dfdb7ee83e4e19da2f57e0eb3aa`.

Observed architecture:

- Xtext grammars and IDE services;
- EMF semantic model/adapters and validation;
- standard-library build/order requirements;
- Eclipse and Jupyter deployments;
- PlantUML visualization;
- API/repository integration artifacts.

The Pilot is the primary executable oracle because it is maintained with the official release program. It remains fallible and release-specific. A disagreement is resolved against specifications/resolutions and recorded; it is not silently treated as normative.

### Tier 3 — comparative implementations

#### Spec42

Exact candidate: `v0.46.0`, `a3f066ee4095a0eb8b37545ffd4846d42804658a`, MIT.

Useful evidence:

- Rust analysis engine shared by LSP and CLI;
- workspace indexing, library configuration, diagnostics, navigation, completion, hover, tokens, formatting, references/rename;
- deterministic validation/export and explicit conformance documentation;
- promising local packaging, caching, snapshot, test, rendering, and editor/CI parity patterns.

Blocking uncertainty:

- explicitly partial coverage;
- independent semantic implementation;
- pre-1.0 interface/release churn;
- product contracts cannot depend on its AST/host API before adapter qualification.

Decision: leading candidate for first qualification run, not runtime authority.

#### `daltskin/sysml-v2-lsp`

Exact candidate: `v0.24.0`, `6838e9c775f15fc3a3662ea294f13809a1c21577`, MIT.

Observed active TypeScript/ANTLR language tooling, LSP features, clients/tooling, tests and benchmarks. Its independent grammar/release alignment, semantic completeness, source preservation, and snapshot suitability require the identical qualification suite. Its TypeScript/web fit does not reduce the semantic burden.

#### `VinQut/sysmlv2-lsp`

Exact candidate: `373dfb960860c3ac259f56169ddabc06d2847eca`, MIT wrapper.

It demonstrates a standalone Java 21 LSP around official Pilot/Xtext components and provides diagram work. Reported 45–60 second standard-library indexing and bundled Pilot/version/license details require measurement and a clean rebuild from the chosen official pin. It is wrapper evidence, not a redistributable selected binary.

#### SysIDE

The public `sensmetry/sysml-2ls` repository is archived and targets older language/release assumptions. The current successor is commercially licensed. The legacy project remains useful history for textual editing, project/library behavior, and migration risks, but is not a current open runtime candidate without a redistributable SDK and exact release evidence.

#### VoidAliot VS Code extension

Public product behavior establishes a strong expectation for local/offline multi-file editing, libraries/KPARs, language intelligence, editable diagrams, separate layout state, source-backed graphical changes, diagnostics documentation, and grounded model tools. Published licensing is proprietary/freeware. No implementation, assets, grammar, or bundles may be copied or reverse-engineered.

### Tier 4 — industry workflow observation

Cameo/MagicDraw, Capella/Arcadia, Rhapsody, Enterprise Architect, VS Code, JetBrains, Jama Connect, Valispace, and GitHub are reviewed in `10-industry-product-and-workflow-review.md`. They inform navigation, viewpoint, property, trace, baseline, review, and evidence workflows. They are not semantic sources.

## Standard libraries and package/API formats

- Official libraries and KPARs are pinned by release/commit/content hash.
- Library resolution order, visibility, shadowing, aliases, cycles, and derived semantics are mandatory engine tests.
- The Systems Modeling API/Services specification is a future interoperability reference, not the internal UI protocol.
- Repository/API identities are mapped into workbench stable identities; they do not replace source-backed identity for local workspaces.
- Abstract-syntax JSON/XMI/KPAR import/export are capability-profile operations and never authorize lossy source rewrite.

## Local/offline deployment feasibility

All proposed production paths can remain local after installation:

- independently executable Workbench Service;
- stdio for harness/desktop;
- authenticated loopback HTTPS/WSS for browser + local companion;
- packaged libraries and qualified engine;
- Tauri as optional offline host.

Remote provider AI and managed hosting remain separately configured and visibly networked.

## License/redistribution inventory

| Material | Observed license | Phase 0 decision |
|---|---|---|
| official release/Pilot software and models | EPL-2.0 at selected pins; specification documents have stated OMG terms | exact-pin notices/source/SBOM and legal review |
| Spec42 | MIT | qualify source/binaries; library notices separate |
| daltskin LSP | MIT | qualify; dependency/library SBOM |
| VinQut wrapper | MIT wrapper; bundled Pilot obligations separate | rebuild and audit, do not reuse unexplained bundle |
| SysIDE legacy/current | archived repository license files/current commercial terms | observation only unless independently cleared |
| VoidAliot | proprietary/freeware published terms | behavioral observation only |
| commercial product docs/assets | vendor copyright/terms | cite public docs; no copying of assets or implementation |

The repository itself still needs an explicit root license before external distribution. Dependency/license scanning supplements, not replaces, artifact-level notice review.

## Decision impact

- ADR-001 separates semantic authority, oracle, candidates, and selected runtime.
- ADR-003/006 make the service/protocol independent of engine and shell.
- Phase 1 produces comparative evidence before selection.
- A candidate may be rejected without client/product rewrite.
- The current parser receives no expansion and remains a negative control only.
