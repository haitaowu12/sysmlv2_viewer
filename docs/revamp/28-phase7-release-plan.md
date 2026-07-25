# Phase 7 — Hardening and Release Plan

Status: in progress
Baseline: `1b49d5c9339e2169955f48b4add49de6367087e7`
Branch: `codex/sysml-workbench-phase7-release`

## Objective

Turn the qualified P1-P6 workbench into an installable release candidate with
one fail-closed verification command, reproducible runtime bundle, explicit
security/privacy boundaries, measured performance/accessibility, recovery
documentation, and clean-install evidence.

Production release remains blocked until every mandatory machine and owner gate
is evidenced. This plan does not redefine a missing signed/platform/human
qualification as success.

## Selected distribution profile

Profile B, browser plus authenticated loopback companion, is the first
production architecture. The release bundle contains:

- the built Workbench UI;
- the compiled Workbench Service;
- exact production Node dependencies;
- locked semantic and authoring engine artifacts;
- the pinned official standard library;
- launchers for the qualified operating-system target;
- license notices, SBOM, release manifest, hashes, and recovery guidance.

The bundle requires a supported Node and Java runtime unless a platform
installer embeds them. It must function without network access after
installation.

Profile C native desktop hosting remains a packaging enhancement, not a
separate semantic architecture. A signed/notarized installer is required for a
public production channel. An unsigned portable bundle can qualify only as an
internal release candidate.

## Workstreams

### 1. Release command and deterministic evidence

- Add `npm run verify:release`.
- Run lint, type/build, mandatory unit/integration/E2E, fixture profile,
  report determinism, production dependency and vulnerability audit, license
  policy, bundle assembly, bundle verification, and release-manifest checks.
- Remove stale phase-specific workflow commands.

### 2. Local installation bundle

- Serve static UI from the paired loopback service with strict security
  headers and no directory traversal.
- Assemble a reproducible bundle only from exact locked runtime artifacts.
- Verify artifact/library hashes before launch.
- Include macOS and Windows launch scripts/config contracts.
- Run a copied-bundle smoke without repository-relative imports.

### 3. Security and privacy closure

- Revalidate loopback Host/Origin/pairing/CSRF/WS controls.
- Add static-asset CSP and traversal tests.
- Add AI audit path/symlink tests.
- Produce license policy, SBOM, notices, dependency audit, and threat closure.
- Document residual risks and release blockers.

### 4. Accessibility and usability

- Add automated axe checks over the primary shell and assistant.
- Repair keyboard/focus semantics, contrast/status text, reduced motion, and
  accessible alternatives.
- Record the existing eight-task automated pilot separately from the mandatory
  three-person usability pilot; do not substitute one for the other.

### 5. Performance

- Refresh medium locked-runtime measurements with the required warm-up/sample
  counts.
- Add service-level query/matrix/diff/report benchmarks.
- Record misses with impact and mitigation; no target waiver by renaming.

### 6. Operations and documentation

- Replace stale Viewer user/developer guides.
- Add workspace, deployment, migration, installation, backup/recovery,
  troubleshooting, and release-checklist documentation.
- Add crash/failure diagnostics that omit model content.
- Generate the release manifest from the exact Git head.

## Gate P7 acceptance

Technical gates:

- `npm run verify:release` passes from a clean checkout.
- The exact runtime bundle assembles and verifies without network.
- The bundled UI/service opens the pilot workspace and runs the release smoke.
- Production audit and license policy have zero unapproved findings.
- Report and release manifests are deterministic.
- Accessibility automation has no serious/critical violations.
- Performance evidence records all required target outcomes.
- Threat-model closure has no undisposed critical risk.
- Documentation matches implemented behavior.

Owner/external gates:

- minimum supported operating systems and distribution channel are approved;
- each claimed OS has clean-machine evidence;
- public binaries are signed/notarized or the owner explicitly limits the
  release to an internal unsigned channel;
- three independent pilot users complete the specified tasks and critical
  findings are closed;
- residual performance/security exceptions receive owner, expiry, and
  mitigation;
- product name and release version are approved.

No production tag or public release is created before both gate groups pass.
