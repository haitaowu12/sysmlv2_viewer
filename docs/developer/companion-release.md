# Self-contained Pages companion release

## Scope

The companion distribution makes the GitHub Pages shell useful for local,
private engineering work without an Apple Developer ID. The static shell
remains unprivileged. An unsigned local process owns filesystem access,
language services, report generation, and workspace persistence over a paired
loopback session.

The initial bundle target is **Apple Silicon macOS only** (`darwin-arm64`). It
contains:

- the exact portable Workbench release payload;
- the locked semantic and authoring engines;
- the pinned SysML standard library;
- an exact Node.js 22 arm64 executable;
- a Java 21 runtime minimized from the semantic engine's module graph;
- product, runtime, and dependency licenses;
- full-file integrity and runtime-provenance manifests.

Windows is not qualified by this build. The existing Windows Spec42 hash is not
enough to qualify the complete semantic engine, launcher, runtime, and smoke
path.

## Local technical build

Start with a portable `darwin-arm64` bundle produced from the exact current
commit. The source worktree and portable manifest must be clean for qualifying
output.

```bash
npm run companion:package -- \
  --portable-bundle /absolute/path/to/sysml-engineering-workbench-0.7.0-rc.1-darwin-arm64 \
  --node-executable /absolute/path/to/node-22-arm64 \
  --java-home /absolute/path/to/jdk-21/Contents/Home \
  --output generated/companion-release
```

The command emits:

- a directory named
  `sysml-engineering-workbench-<version>-pages-companion-darwin-arm64`;
- a normalized `.tar.gz` archive;
- archive and companion-manifest SHA-256 values on stdout;
- `manifests/companion-manifest.json`, including all staged runtime hashes,
  the portable payload provenance, and the complete file inventory.

The technical smoke deliberately gives the companion child
`PATH=/sysml-workbench-smoke-no-system-runtime`. This proves that startup,
semantic indexing, and workspace open use the bundled Node and Java paths. It
also supplies invalid `NODE_OPTIONS`, `NODE_PATH`, `JAVA_TOOL_OPTIONS`,
`JDK_JAVA_OPTIONS`, and `_JAVA_OPTIONS`; successful startup proves that the
launcher clears inherited runtime-injection settings before verification:

```bash
npm run companion:smoke -- \
  --bundle generated/companion-release/sysml-engineering-workbench-0.7.0-rc.1-pages-companion-darwin-arm64 \
  --workspace-file fixtures/workspaces/phase5-infrastructure/sysml-workspace.yaml \
  --model-marker InfrastructureOpenIssues \
  --output generated/companion-release/smoke.json
```

The smoke also verifies the bundle inventory, one-time loopback pairing,
qualified language authority, pilot workspace open, and absence of model
markers or session credentials from captured logs.

## Hosted CI

`.github/workflows/companion-release.yml` is a manually dispatched,
hash-pinned pipeline on `macos-14`. It reads three independently governed
variables from the protected `companion-release` GitHub environment:

- `APPROVED_COMPANION_SOURCE_SHA`;
- `APPROVED_COMPANION_PORTABLE_URL`;
- `APPROVED_COMPANION_PORTABLE_SHA256`.

The workflow dispatcher cannot override those values. Configure required
environment reviewers before enabling the job. The workflow:

1. checks that the hosted runner is arm64;
2. installs Node 22 and Java 21 build inputs;
3. verifies the approved source SHA and downloaded payload hash before parsing
   it, then uses the verifier from the checked-out source—not executable code
   supplied by the archive—to validate the internal inventory;
4. stages the self-contained runtime;
5. runs restricted-path smoke on the staged tree;
6. extracts the archive into a clean directory and repeats smoke;
7. uploads the unsigned archive and JSON evidence for 14 days.

Hosted-runner smoke is reproducible CI evidence. It is **not** a substitute for
human clean-machine acceptance on supported macOS hardware.

## Distribution boundary

The local runtime itself performs no external fetch. The default browser shell
is GitHub Pages, so an initial shell load requires network access unless a
previously cached shell is explicitly demonstrated. The package manifest does
not claim general offline operation.

The output is unsigned and not notarized. It is an internal technical
candidate, not a public production installer. A user may encounter macOS
quarantine because the staged executables do not carry a Developer ID
signature. Do not publish the archive under a production release tag.

A human acceptance record must bind the tested archive SHA-256 to:

- an Apple Silicon machine without Node, Java, or a repository checkout;
- the macOS version and hardware;
- successful pilot workspace diagnostics and report generation;
- offline repeat operation after the Pages shell has been cached;
- observed quarantine/Gatekeeper handling;
- log-safety and shutdown results.

The absence of an Apple Developer ID blocks a frictionless notarized macOS
installer. It does not block engineering qualification of this self-contained
companion architecture.
