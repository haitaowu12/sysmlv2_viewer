# Phase 7 Owner Decisions and Desktop Release Boundary

Status: architecture and license decisions recorded; external release evidence
still required  
Decision date: 2026-07-25

## Decisions now in force

| Decision | Selected outcome | Effect |
|---|---|---|
| Product name | SysML Engineering Workbench | `Viewer` no longer defines the production contract |
| Product license | Apache-2.0 | root `LICENSE` and `NOTICE` are release inputs |
| Semantic runtime license | exact pinned Pilot is EPL-2.0 | applies only to the recorded wrapper, Pilot commit, and semantic artifact hash; original VinQut NOTICE remains bundled |
| First production shell | Tauri desktop | native host owns picker/process/distribution only; shared protocol and services remain authoritative |
| First supported platform | Apple Silicon, macOS 13+ | no Windows or Intel Mac claim in `0.7.0-rc.1` |
| Runtime packaging | self-contained | Node 22, minimized Java 21, both language engines, standard library, UI, and service are bundled |
| Distribution format | signed `.app` and DMG | Developer ID signing, notarization, and stapling are mandatory for public distribution |
| Current artifact class | ad-hoc technical candidate | controlled internal evaluation only |

These source-level decisions are not substitutes for the private,
artifact-hash-bound release approval records.

## Implemented technical controls

- exact-head portable bundle required before desktop staging;
- wrong platform, dirty source, runtime hash drift, and source-commit mismatch
  fail closed;
- Node and Java inputs are explicit, version-checked, regular files;
- minimized Java runtime includes reflectively loaded provider modules;
- Tauri capabilities expose only the native dialog and sidecar operations
  required by the host;
- native workspace paths are canonicalized and must name
  `sysml-workspace.yaml`;
- every launch re-verifies the bundled portable runtime before starting the
  service;
- app exit terminates the bundled service;
- adapter shutdown handles engine-stream failure without an unhandled `EPIPE`;
- native smoke runs with `PATH=/usr/bin:/bin`, opens the four-file pilot through
  the qualified hybrid authority, retrieves diagnostics, checks logs for
  source/session leakage, and requires a clean shutdown;
- locked npm and Cargo license inventories are generated;
- target-aware RustSec audit blocks vulnerabilities and unsoundness.

## Open risk register

### P7-RISK-001 — Tauri URLPattern maintenance chain

State: open pending final owner disposition  
Severity: moderate maintenance risk, no current vulnerability  
Evidence: `phase7-desktop-rustsec-audit.json`

The macOS arm64 target graph contains five unmaintained `unic-*` crates through
`tauri-utils -> urlpattern 0.3`. The target-aware audit reports zero
vulnerabilities and zero unsoundness findings. Non-target GTK warnings are
excluded from the macOS claim but remain visible in the raw Cargo audit.

Mitigation:

1. monitor Tauri/`urlpattern` updates;
2. update the lock when Tauri accepts the maintained URLPattern chain;
3. rerun Cargo license, RustSec, compile, bundle, and native smoke evidence;
4. if still present at final approval, require explicit owner acceptance with
   an expiry no later than 2026-10-23.

### P7-RISK-002 — Public trust chain absent

State: blocking  
Severity: high distribution risk

The current `.app` is ad-hoc signed for integrity testing. It has no Developer
ID identity or Apple notarization ticket. Do not distribute it publicly or
instruct users to bypass Gatekeeper.

### P7-RISK-003 — Independent operational evidence absent

State: blocking  
Severity: high release-confidence risk

The exact signed artifact still needs a separate clean-machine exercise,
manual accessibility qualification, and three independent usability
participants. Automated evidence cannot substitute for these gates.

## Next release gate

The next release candidate is eligible for owner approval only after:

1. exact-head `.app` and DMG assembly;
2. Developer ID signing, notarization, stapling, and Gatekeeper verification;
3. clean-machine offline/recovery/log-safety qualification;
4. manual accessibility evidence;
5. three complete, unassisted participant records;
6. disposition of P7-RISK-001;
7. strict `npm run verify:release` without waiver flags.
