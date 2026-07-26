# SysML Engineering Workbench Desktop

This Tauri host packages the same web client, protocol, Workbench Service, and
qualified language runtimes used by the local-companion profile. It owns only
desktop lifecycle, native workspace selection, and distribution integration.
No semantic or command logic belongs in this host.

The initial production target is Apple Silicon on macOS 13 or later.

## Stage the self-contained runtime

First assemble and verify the exact portable bundle. Then stage it with exact
Node 22 and Java 21 inputs:

```bash
npm run desktop:stage -- \
  --portable-bundle generated/release/sysml-engineering-workbench-0.7.0-rc.1-darwin-arm64 \
  --node-executable "$(command -v node)" \
  --java-home "$(/usr/libexec/java_home -v 21)"
```

The staging command:

- rejects the wrong platform, dirty source, or source-commit mismatch;
- verifies the portable bundle before copying it;
- copies the exact Node executable as a signed Tauri sidecar;
- creates a minimized Java 21 runtime with `jdeps` and `jlink`;
- preserves Node and Java license material; and
- writes a deterministic desktop-runtime inventory.

Generated runtimes and build outputs are ignored. They must be recreated from
the exact release inputs.

## Build

Unsigned local qualification:

```bash
npm run desktop:build:app
```

Technical DMG qualification uses an ad-hoc Tauri signing identity so the app
is sealed before it enters the image:

```bash
APPLE_SIGNING_IDENTITY=- npm run desktop:build:dmg
npm run desktop:smoke:dmg -- \
  --dmg "apps/workbench-desktop/src-tauri/target/release/bundle/dmg/SysML Engineering Workbench_0.7.0_aarch64.dmg" \
  --workspace-file fixtures/workspaces/phase5-infrastructure/sysml-workspace.yaml \
  --model-marker InfrastructureOpenIssues
```

Production signing and notarization use protected local/CI environment
variables documented in `docs/developer/desktop-release.md`.

An unsigned or ad-hoc-signed app remains a technical candidate. It is not a
production distribution.
