# Threat Model

Status: P7 closure review. Implemented controls below are tested; open
distribution and usability gates prevent a public production claim.

## Assets

- canonical source, Git history, libraries, workspace configuration;
- stable identities, reviews, findings, baselines, evidence, audit;
- credentials and provider configuration;
- command proposals/approvals/receipts;
- semantic/report integrity and official-release provenance;
- local filesystem/process/keystore capabilities;
- hosted tenant identity and authorization.

## Adversaries and untrusted input

- malicious model/library/KPAR/archive/report/evidence content;
- malicious website attempting local companion access;
- compromised dependency, runtime engine, sidecar, extension, or update;
- unauthorized local user/process;
- authenticated user exceeding role/workspace scope;
- hostile/compromised hosted tenant;
- prompt injection or malicious external AI output;
- crafted Git repository/path/symlink/file watcher state.

## Threats and controls

| ID | Threat | Boundary | Controls | Closure |
|---|---|---|---|---|
| T1 | path traversal/symlink escape | service→filesystem | canonical roots, capability handles, no client paths, TOCTOU-safe operations, tests | P1 |
| T2 | unsafe watcher/large tree exhaustion | service→workspace | allowlisted roots, ignore rules, quotas, debounce, cancellation | P1 |
| T3 | engine crash/RCE/untrusted parse | service→engine | separate least-privilege process, time/memory limits, checksum/SBOM, no shell strings, restart | P1/P7 |
| T4 | semantic downgrade/silent fallback | adapter→candidate | exact pins, capability handshake, visible stale/failure, no automatic legacy fallback | P1 |
| T5 | malicious origin reaches companion | browser→loopback | pairing, exact Origin/Host, anti-rebinding, short token, CSRF/WS checks | P1 |
| T6 | loopback token replay/theft | browser→companion | memory-only short TTL, audience/origin binding, nonce/idempotency, revocation | P1 |
| T7 | protocol injection/DoS | client→service | generated schemas, size/rate/job limits, timeouts, fuzzing, backpressure | P1/P7 |
| T8 | privileged desktop WebView compromise | UI→Tauri | local trusted content, CSP, minimal per-window capabilities, navigation/sender validation | P4/P7 |
| T9 | command corrupts unknown source | service→source | exact snapshot/range, opaque guards, atomic journal, validation, diff, approval, undo | P3 |
| T10 | identity spoof/stale review anchor | semantic→governance | scoped stable ids, locator/fingerprint, alias receipts, baseline binding, staleness | P2/P5 |
| T11 | report/markup XSS or active content | service→browser/export | sanitize/escape, CSP, safe SVG/PDF pipeline, no arbitrary embedded scripts | P4/P5 |
| T12 | AI leaks/invents/applies | service→provider/source | off by default, context manifest, narrow tools, citation validation, proposal-only approval | P6 |
| T13 | logs/crash dumps leak content | all | content-minimized structured logs, redaction, opt-in crash upload, retention | P1/P7 |
| T14 | malicious update/dependency | distribution | signed artifacts, hashes, SBOM, pinned builds, vulnerability/license scanning | P1/P7 |
| T15 | hosted cross-tenant access | hosted service→persistence/jobs | server-side object auth, isolation, quotas, encryption, audit, tests | before D |
| T16 | database becomes shadow model | hosted adapter→semantics | canonical source/artifact schemas, adapter equivalence, immutable manifests | before D |
| T17 | denial during indexing/report | service resources | progressive status, cancellation, worker isolation, budgets, degraded mode | P1/P5 |
| T18 | Draw.io/remote embed egress | export/markup | export-only, local default, isolated explicit remote action, sanitized reimport as attachment | P4 |
| T19 | bundled Node JIT entitlement expands executable-memory surface | desktop host→sidecar | exact signed Node hash, `allow-jit` only, no unsigned-executable-memory entitlement, no remote privileged content, strict CSP, loopback pairing, mounted-DMG runtime smoke | P7 |
| T20 | public Pages origin or copied bootstrap leaks local path/pairing authority | Pages→loopback | no path in URL/response, fragment-only one-time secret, immediate fragment scrub, exact-origin PNA/CORS, opaque handle, short expiry | P7/B |

## Implemented control status

Implemented and tested:

- canonical allowed-root checks and rejection of escaping or any model-source
  symlink;
- file-count, aggregate-byte, JSON-RPC message, LSP header/message, and raw
  capture limits;
- child processes launched without a shell and with bounded request timeouts;
- LSP cancellation on timeout, visible failed/stale state, and explicit restart;
- exact loopback Host/Origin, pairing expiry, bearer, CSRF, and security headers;
- exact Pages-origin Private Network Access preflight, fragment bootstrap
  scrubbing, no workspace path in the launch URL/pairing response, and
  service-issued opaque workspace handles;
- locked runtime artifact SHA-256 verification before qualified startup;
- engine-proposed workspace edits rejected when any URI is outside the active
  document set;
- zero-finding npm audit and deterministic production SBOM/license inventory;
- target-aware macOS arm64 RustSec audit with zero vulnerabilities and zero
  unsoundness findings, plus explicit unmaintained-dependency notices;
- self-contained Tauri app/DMG with exact Node/Java manifests, strict
  code-integrity verification, native picker ACL, app-owned service lifecycle,
  mounted-read-only DMG workspace smoke, clean shutdown, and log-leak checks;
- same-origin loopback static serving with strict CSP, traversal rejection,
  immutable asset caching, and whole-bundle preflight hashes;
- modern Pages-profile build with restrictive CSP and no external font/runtime
  dependency;
- recovery-journaled command writes, base-hash conflicts, opaque-range guards,
  explicit approval, validated undo/redo, and restart recovery;
- stable-identity review anchors, baseline binding, semantic change
  classification, and staleness detection;
- sanitized deterministic HTML/PDF/CSV reporting;
- local-only controlled AI, narrow tools, citation rejection, proposal-only
  commands, user-only approval, audit hashes, traversal rejection, and audit
  symlink containment;
- automated structural accessibility checks, visible keyboard focus,
  focus-contained command palette, reduced motion, and diagram matrix
  alternative.

Not exposed at P1:

- filesystem watching is not implemented, so an unsafe watcher cannot run;
- `.kpar` extraction is not implemented and archives fail closed;
- no remote/shared listener, telemetry, automatic update, or external AI egress
  exists in the new service.

Open release gates:

- progressive indexing/cancellation beyond individual LSP requests;
- watcher debounce/quotas and TOCTOU tests when watching is introduced;
- process sandboxing and large-workspace memory budgets remain residual risk
  for the internal RC and require disposition before public distribution;
- Developer ID signing, notarization, stapling, and signed-update policy;
- clean-machine OS and three-person usability evidence;
- final owner disposition or upstream removal of the five target-relevant
  unmaintained `unic-*` maintenance notices;
- manual contrast/screen-reader review (automated JSDOM axe cannot measure
  rendered color contrast).
## Security invariants

- no renderer, client, AI, or transport bypasses service authorization and command validation;
- no engine output is authoritative outside the declared capability profile;
- no network listener binds beyond loopback in local profiles;
- no remote/shared deployment enumerates a workspace before authentication;
- no source/provider key enters client bundles or committed project artifacts;
- no visual/report output omits unresolved diagnostics/exclusions without disclosure.

## Verification

Use unit/property/fuzz/integration/E2E/clean-machine tests plus dependency, license, static, and dynamic scans. Profile B requires malicious-origin/DNS-rebinding/CSRF/CSWSH/path tests. Profile C requires Tauri capability/navigation/IPC tests. Profile D requires a separate hosted threat-model amendment and penetration assessment.

Residual critical risk needs a dated owner disposition, affected criteria, compensating control, accountable owner, and expiry. P7 revalidates; it does not defer first closure.
