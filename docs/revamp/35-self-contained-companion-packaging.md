# Self-contained Pages companion packaging status

## Decision

Use the GitHub Pages application as an unprivileged shell and ship a separate
local companion archive for private filesystem, language-service, persistence,
Git, and reporting responsibilities. This path continues engineering delivery
without treating Apple Developer ID availability as an architecture decision.

The first packaging slice is `darwin-arm64` only. It reuses the locked release
payload and the same runtime staging logic as the Tauri desktop build.

## Implemented technical controls

| Control | Evidence mechanism |
|---|---|
| exact source | portable manifest source commit must equal `git HEAD` |
| locked payload | portable verifier plus semantic, authoring, and library hashes copied into companion manifest |
| Node runtime | exact Node 22 arm64 input, staged executable SHA-256 |
| Java runtime | Java 21 JDK input, `jdeps` module derivation, explicit reflective modules, minimized `jlink` image |
| source preservation | service and language engines are unchanged; the shell never receives direct filesystem authority |
| self containment | launcher uses absolute bundled Node and Java paths |
| isolation proof | smoke child receives a deliberately nonexistent `PATH` |
| integrity | complete inventory of every bundle file except the self-describing companion manifest |
| provenance | archive and manifest SHA-256, runtime versions, module list, source and payload hashes |
| pairing | loopback-only service and short-lived, one-time fragment secret |
| log safety | pilot model marker and session credentials must be absent from captured output |
| claim boundary | unsigned, not notarized, Windows false, human clean-machine acceptance false |

## CI boundary

The macOS companion workflow is manual because the locked portable language
runtime is not reconstructed by ordinary source CI. Dispatch requires a
separately produced HTTPS payload and its expected SHA-256. The workflow rejects
an archive whose internal source commit differs from the checked-out SHA.

The hosted `macos-14` job checks arm64 explicitly, packages the bundle, smokes
the staged tree under a nonexistent executable search path, extracts the
archive into a clean directory, and repeats the smoke. Its artifacts are
short-lived unsigned engineering candidates.

This is hosted-runner qualification evidence, not independent clean-machine
acceptance and not permission to publish a production release.

## Remaining gates

- perform and record human clean-machine acceptance on supported Apple Silicon
  macOS;
- decide an owner-approved distribution route for unsigned quarantined
  archives;
- obtain Developer ID and notarization evidence before claiming a conventional
  public macOS installer;
- lock and qualify the complete Windows semantic engine, Java runtime,
  launcher, security boundary, and smoke path before adding Windows;
- keep the Tauri installer lane paused until signing credentials exist or the
  owner explicitly resumes its technical-candidate work.
