# macOS Desktop Release

## Scope

The initial production distribution is SysML Engineering Workbench for Apple
Silicon on macOS 13 or later. It is a Tauri host over the same typed Workbench
protocol used by the local companion. The host owns native workspace selection,
bundled-process lifecycle, and distribution integration; it does not implement
SysML semantics or source mutation.

The installed application is self-contained:

- built Workbench UI and Service;
- locked semantic and authoring engine artifacts;
- pinned SysML standard library;
- exact Node.js 22 arm64 sidecar;
- minimized Java 21 runtime;
- release, runtime, license, and integrity manifests.

## Reproducible technical build

Prerequisites on the arm64 build Mac:

- clean exact source checkout;
- Node.js 22 and `npm ci`;
- Java 21 JDK with `jdeps` and `jlink`;
- current stable Rust toolchain with `rustfmt`;
- exact portable release bundle from the same clean source commit.

Stage and build. For the technical DMG only, `-` asks Tauri to apply a complete
ad-hoc hardened-runtime signature before placing the app in the image:

```bash
npm run desktop:stage -- \
  --portable-bundle generated/release/sysml-engineering-workbench-0.7.0-rc.1-darwin-arm64 \
  --node-executable /absolute/path/to/node \
  --java-home /absolute/path/to/jdk-21/Contents/Home

npm run desktop:license
npm run desktop:audit
npm run desktop:check
APPLE_SIGNING_IDENTITY=- npm run desktop:build:dmg
```

Run the mounted, read-only DMG smoke:

```bash
npm run desktop:smoke:dmg -- \
  --dmg "apps/workbench-desktop/src-tauri/target/release/bundle/dmg/SysML Engineering Workbench_0.7.0_aarch64.dmg" \
  --workspace-file fixtures/workspaces/phase5-infrastructure/sysml-workspace.yaml \
  --model-marker InfrastructureOpenIssues
```

Ad-hoc output is not a public distribution artifact.

The Node sidecar needs the hardened-runtime `allow-jit` entitlement to execute
the Workbench Service. No unsigned-executable-memory entitlement is granted.
The read-only DMG smoke is mandatory because a version-only sidecar check does
not exercise JIT startup.

## Developer ID and notarization gate

Production signing must run on the exact verified artifact with protected Apple
Developer credentials supplied by the owner or release CI. No certificate,
private key, app-specific password, API key, or keychain password belongs in
the repository, logs, or evidence bundle.

The release operator must:

1. sign embedded executable code and the application with a Developer ID
   Application identity;
2. verify the app with `codesign --verify --deep --strict`;
3. build/sign the DMG without changing the verified app;
4. submit the exact DMG with `xcrun notarytool`;
5. require an accepted notarization result;
6. staple the ticket to the app/DMG;
7. verify with `xcrun stapler validate` and `spctl -a -vv`;
8. hash the final artifact and bind all evidence records to that hash.

Tauri's documented Apple signing environment may be used in protected CI, but
the repository's release validator—not the presence of environment
variables—decides whether Gate P7 passes.

## Clean-machine qualification

On a separate macOS 13+ Apple Silicon machine with no repository checkout,
Node installation, or Java installation:

1. install the notarized DMG;
2. launch without a Gatekeeper bypass;
3. open the pilot workspace;
4. exercise diagnostics, navigation, edit/patch preview, report, and recovery;
5. disconnect network and repeat workspace open/report generation;
6. restart and confirm saved views/reviews;
7. inspect crash and operational logs for source, token, and credential leaks;
8. record the exact OS, hardware, artifact SHA-256, outcomes, and operator.

The hash-bound platform, signing, accessibility, and usability records then
feed `config/release-approval.json`. No production tag is created until
`npm run verify:release` passes without waiver flags.
