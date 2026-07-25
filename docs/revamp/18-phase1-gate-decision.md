# Phase 1 Gate Decision

- Date: 2026-07-25
- Phase 0 baseline: `ade6e07fd1cecd615f21d42744dfd56380a42934`
- Decision: **HYBRID GO**
- Gate P1: **accepted with bounded conditions**
- Authorized next phase: **P2 semantic model, identity, and query**
- Production claim: **not yet authorized**

## Selected runtime authority

| Operation | Runtime | Authority |
|---|---|---|
| parse, resolve, diagnostics, document/workspace symbols, definition, references, hover | VinQut `373dfb960860c3ac259f56169ddabc06d2847eca`, rebuilt against Pilot `fa709f28dfd49dfdb7ee83e4e19da2f57e0eb3aa` | authoritative |
| completion, semantic tokens, rename proposal, formatting proposal | Spec42 `a3f066ee4095a0eb8b37545ffd4846d42804658a` | non-authoritative authoring assistance |
| source inventory, workspace authorization, normalized DTOs, failure state, artifact verification | Workbench Service adapter `0.2.0` | authoritative product boundary |
| semantic snapshot, identity, query | product-owned normalized layer | mandatory P2 work; unavailable at P1 |

The adapter never merges diagnostics and never silently substitutes one engine
for the other. A failure in either selected process fails the declared hybrid
session. Proposed rename/format edits are constrained to active workspace URIs;
P3 must validate and approve them through the semantic authority before apply.

The runtime lock is
`config/language-engine-runtime-lock.json`. It verifies the selected artifacts:

- VinQut/Pilot jar SHA-256
  `e717eec5fc406b739983f8896ae5c8a6b4eb9510568225988a7cda3e95437dbe`;
- exact-release Xtext library index SHA-256
  `d010a8644265b8aadab103f1cc9024bb143b34d825ea2139e11590ee337cd8fe`;
- Spec42 macOS arm64 executable SHA-256
  `22911d70f7f41251e257aef3ae4a3a402e77063d2271ed394a114834d7ee362e`.

Hash mismatch blocks startup. The compiled service demonstrated
`semanticAuthority: qualified-engine`, zero authoritative diagnostics, one
cross-file definition, and 41 completion items.

## Comparative evidence

The committed normalized record is
`docs/revamp/phase1-runtime-qualification-evidence.json`. Raw candidate streams
remain local because they include machine paths; their report hashes are
recorded in that file.

### Exact official release

All standard-library observations materialized the pinned official `2026-05`
source tree into the workspace. This prevents a pass against a candidate's
older bundled library.

| Candidate | 3-file sample | exact library: 95 documents | malformed input |
|---|---:|---:|---:|
| Spec42 | pass, 0 diagnostics | fail, 859 errors / 774 warnings | pass |
| daltskin | 0 errors, 2 policy information items | pass, 0 diagnostics | pass |
| VinQut/Pilot | pass, 0 diagnostics | pass, 0 diagnostics | pass |

Spec42's library divergence disqualifies it from semantic authority. Daltskin's
bundled release skew and large-workspace instability disqualify it from the
selected runtime. VinQut is the only evaluated runtime clean on both the normal
workspace and the exact official library. The direct Pilot service remained
unpackaged; VinQut supplies the tested Pilot-backed service boundary.

### Language operations and failure behavior

The Workbench Protocol now covers diagnostics, symbols, definition, references,
hover, completion, semantic tokens, rename proposals, formatting proposals,
full-document incremental updates, explicit restart, and workspace lifecycle.

- request timeout emits LSP cancellation and fails visibly;
- a crashed engine marks the last result stale;
- explicit restart creates a legal fresh LSP session and reopens source;
- same-root reopen does not issue an illegal second initialize;
- root change restarts both selected processes;
- incremental document versions must increase;
- engine-proposed edits outside the active workspace are rejected;
- stdout/stderr capture is bounded and hashed;
- no fallback activates after timeout or crash.

Tests: 6 Workbench files / 17 tests, plus the full existing suite.

## Performance decision

Reference machine: Apple Silicon engineering laptop, Node 22, Java with
`-Xmx2g`. Five fresh-process repetitions were used.

| Profile | Cold p95 | Warm p95 | Result | Peak semantic RSS | Peak authoring RSS |
|---|---:|---:|---|---:|---:|
| medium, 100 files / 10,000 declarations | 6.109 s | 1.659 s | five deterministic zero-error runs | 450 MiB | 587 MiB |
| large, 500 files / 50,000 declarations | 16.493 s | 12.104 s | five deterministic zero-error runs; no crash | 1.22 GiB | 3.38 GiB |

Warm medium reopen satisfies the 3 s gate. Cold medium indexing misses the 5 s
target by 1.109 s. Large indexing remains functional but exceeds a responsible
production memory budget. Therefore:

- the qualified P1 profile is capped at the medium benchmark;
- large workspaces are experimental and visibly warned;
- P2/P4 must expose source inventory/progress before semantic indexing ends;
- lazy or partitioned authoring indexing is a P2/P4 performance requirement;
- no release claim may include the large profile until memory is requalified.

## Security, dependency, and distribution evidence

- Authenticated loopback Origin/Host/pairing/bearer/CSRF controls pass.
- Workspace traversal and symlink escape tests pass.
- ESLint 10 and compatible TypeScript/React plugins replaced the vulnerable
  toolchain; full `npm audit` reports zero findings.
- The production npm SBOM and license inventory are deterministic:
  - SBOM SHA-256
    `52c040d9fa1d4dcd9342897e7a924239781b0cf974c5ca675910a31cda593168`;
  - license inventory SHA-256
    `6768a6dfd4614ec5014431aa3048679c75812f3559abbb4a3453dc1f99c404cc`.
- Runtime notices identify MIT and EPL-2.0 obligations.

The repository still has no owner-selected product license. Windows runtime
packaging and signed macOS/Windows installers remain P7 gates. No binary runtime
is committed by P1.

## Qualified capability boundary

Supported at Gate P1:

- source-tree workspace configuration and model configurations;
- deterministic multi-file discovery and restart;
- exact source-tree standard-library loading;
- authoritative syntax/semantic diagnostics for the tested core sample;
- cross-file definitions and references;
- symbols and hover;
- non-authoritative completion/tokens/rename/format proposals;
- incremental full-document synchronization;
- stdio and authenticated loopback service execution;
- fail-closed preservation-only mode when no runtime is configured.

Partial or conditional:

- full SysML/KerML coverage: tested official library plus bounded fixtures, not
  a conformance claim;
- references: VinQut returns duplicate/coarse locations; preserved as an
  engine discrepancy for P2 normalization;
- source preservation: untouched source is byte-stable; engine edit
  preservation remains P3 validation work;
- large workspaces: experimental due memory;
- direct Pilot differential: Pilot-backed VinQut used; standalone Pilot service
  remains unbuilt.

Unsupported at this gate:

- direct `.kpar` archive loading (use version-locked extracted source trees);
- candidate-independent semantic snapshot;
- stable model identity and model query;
- typed command apply/undo;
- production installers or remote/shared deployment.

## Conditions carried into Phase 2

1. Produce the normalized semantic snapshot before any new model view consumes
   language data.
2. Normalize/deduplicate references without inventing relationships.
3. Implement stable identity and query APIs over source-provenance-bearing
   elements.
4. Keep `.kpar` loading explicit as unsupported until a safe, bounded,
   path-traversal-resistant archive loader is tested.
5. Add progressive inventory/index status and measure incremental diagnostics
   p95 on real edits.
6. Keep the large profile experimental until memory is below the approved
   budget.
7. Do not connect the legacy parser/store to the new service as fallback.

These conditions limit product claims but do not make semantic snapshot,
identity, or query a Phase 1 responsibility. They are the defined P2 gate.
