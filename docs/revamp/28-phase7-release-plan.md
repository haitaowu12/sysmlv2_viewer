# Phase 7 — Hardening and Release Plan

Status: web-companion delivery path implemented; Gate P7 blocked on portable
distribution, license disposition, and independent external evidence
Baseline: exact source commit recorded by each generated release manifest
Branch: `codex/sysml-workbench-phase7-release`

## Objective

Turn the qualified P1-P6 workbench into an installable release candidate with
one fail-closed verification command, reproducible runtime bundle, explicit
security/privacy boundaries, measured performance/accessibility, recovery
documentation, and clean-install evidence.

Production release remains blocked until every mandatory machine and owner gate
is evidenced. This plan does not redefine a missing signed/platform/human
qualification as success.

## Selected distribution profile — amended 2026-07-25

Profile B, the modern GitHub Pages shell plus a portable local companion, is
the recommended first production-candidate architecture. It does not require
Apple Developer ID signing. The Pages host contains UI assets only; the
companion contains the service, locked runtime, local authorization, and model
authority. See `docs/revamp/34-web-companion-deployment.md`.

Profile C remains an implemented Tauri technical candidate for Apple Silicon
on macOS 13 or later. The application contains:

- the built Workbench UI;
- the compiled Workbench Service;
- an exact Node 22 sidecar;
- a minimized Java 21 runtime generated with `jdeps` and `jlink`;
- exact production Node dependencies;
- locked semantic and authoring engine artifacts;
- the pinned official standard library;
- native workspace selection and service lifecycle control;
- license notices, npm/Rust inventories, release manifest, hashes, and
  recovery guidance.

The optional installed application must function without network access and without
repository-relative or system Node/Java dependencies. Profile B remains a
supported product architecture and is now the first delivery focus.

The desktop host contains no semantic authority. A Developer ID signed and
Apple-notarized `.app` and DMG are required for the public production channel.
An ad-hoc-signed application qualifies only as a technical/internal candidate.
This requirement blocks only Profile C, not Profile B. Portable companion
qualification is independently required for every claimed OS.

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
- Stage Node 22 and a minimized Java 21 runtime for macOS arm64.
- Build and verify the native `.app` and DMG.
- Run a copied-bundle smoke without repository-relative imports.
- Run a native-bundle smoke with a restricted `PATH`, the qualified hybrid
  authority, the four-document pilot, clean shutdown, and log-leak checks.

### 3. Security and privacy closure

- Revalidate loopback Host/Origin/pairing/CSRF/WS controls.
- Add static-asset CSP and traversal tests.
- Add AI audit path/symlink tests.
- Produce license policy, SBOM, notices, dependency audit, and threat closure.
- Inventory the locked Tauri Cargo graph and run RustSec audit before signing.
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
- The `.app` passes strict code-integrity verification, exact-runtime smoke,
  and clean service shutdown.
- Production audit and license policy have zero unapproved findings.
- The locked desktop Cargo graph has zero unapproved license expressions,
  vulnerabilities, or unsoundness findings; informational maintenance notices
  have an owner disposition or remain explicit release blockers.
- Report and release manifests are deterministic.
- Accessibility automation has no serious/critical violations.
- Performance evidence records all required target outcomes.
- Threat-model closure has no undisposed critical risk.
- Documentation matches implemented behavior.

Owner/external gates:

- the selected macOS 13+ arm64 channel has clean-machine evidence;
- public binaries are Developer ID signed, notarized, and stapled;
- three independent pilot users complete the specified tasks and critical
  findings are closed;
- residual performance/security exceptions receive owner, expiry, and
  mitigation;
- the release version and evidence manifest are approved.

No production tag or public release is created before both gate groups pass.
