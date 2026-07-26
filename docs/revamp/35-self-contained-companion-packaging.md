# Self-contained Pages Companion Packaging Status

Status: internal technical packaging evidence; release work frozen during
recovery

Active authorities:

- `docs/revamp/36-failed-attempt-postmortem.md`
- `docs/revamp/37-recovery-acceptance-contract.md`

## Corrected decision

Retain the self-contained companion packaging and integrity controls as
technical foundation work. Do not treat the companion archive or GitHub Pages
shell as a supported product distribution path before Recovery Gate R6.

The current packaging slice is `darwin-arm64`. It stages the locked portable
payload with bundled Node 22 and a minimized Java 21 runtime. The output is an
unsigned internal technical candidate only.

## Implemented technical controls

| Control | Evidence mechanism |
|---|---|
| exact source | portable manifest source commit must equal the assembly checkout |
| clean portable provenance | packaging preflight requires `release.sourceDirty=false` |
| locked payload | checked-out verifier plus semantic and authoring artifact hashes |
| official library | exact locked path, file count, and recomputed canonical inventory tree SHA-256 |
| Node runtime | exact Node 22 arm64 input and staged executable SHA-256 |
| Java runtime | Java 21 JDK input, derived modules, minimized `jlink` image, and inventory hash |
| source preservation | local service owns files and engines; Pages receives no filesystem authority |
| self containment | absolute bundled runtime paths and inherited runtime-injection variables cleared |
| isolation proof | smoke child receives a nonexistent system executable search path |
| integrity | complete inventory; additions, removals, bytes, modes, links, and special files rejected |
| provenance | archive/manifest hashes, runtime versions, module list, source and payload hashes |
| pairing | loopback-only service and short-lived one-time fragment secret |
| log safety | pilot marker and session credentials absent from captured output |
| claim boundary | unsigned, not notarized, Windows unqualified, clean-machine/practitioner acceptance false |

## Fail-closed packaging entrypoint

The supported command is:

```bash
npm run companion:package -- \
  --portable-bundle <path> \
  --node-executable <path> \
  --java-home <path> \
  --output <path>
```

It runs the portable preflight before importing the implementation module.
Direct execution of `workbench-package-companion.ts` or its compiled JavaScript
is rejected, so `--allow-dirty` cannot bypass portable-input provenance and
library-tree verification.

## Hosted CI boundary

The manual macOS workflow uses a protected `companion-release` environment for
approved source SHA, private HTTPS payload URL, and payload SHA-256. The
dispatch caller cannot override them. The checked-out source verifies the
archive before any archive-supplied code executes.

The hosted Apple Silicon job may assemble and smoke a short-lived internal
candidate. This is hosted-runner technical evidence, not:

- independent clean-machine acceptance;
- a real-browser product test;
- practitioner usability evidence;
- permission to publish a release.

The remote Pages shell requires an initial network load unless a cached or
locally served shell is separately qualified. No general offline product claim
is made.

## Frozen release work

Do not perform or claim the following before R6:

- public archive or installer distribution;
- Developer ID signing or notarization;
- updater or support-channel work;
- Windows runtime/launcher qualification;
- Pages production authoring;
- Tauri production packaging;
- production or release-candidate product readiness.

Security and correctness fixes to the packaging code remain permitted. Issue
#10 remains open.

## Conditions to resume distribution work

1. the VS Code-first source/notation/edit vertical slice passes R2-R5;
2. three practitioners complete and rerun R6 against the repaired exact
   artifact;
3. product/runtime license disposition remains accepted;
4. each claimed OS receives a locked artifact and clean-machine record;
5. the owner selects distribution, signing, support, and versioning policy;
6. the final approval manifest binds the exact source, runtime, artifact, and
   evidence hashes.
