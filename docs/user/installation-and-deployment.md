# Installation and Deployment

## Recommended profile without Apple signing

Use the GitHub Pages workbench with the local companion. The Pages
site supplies the modern UI; the companion opens a `sysml-workspace.yaml`,
verifies the bundled runtime, starts the Workbench Service on an
operating-system-selected loopback port, and pairs the browser using
short-lived credentials. The companion does not require an Apple Developer ID.

Static Pages alone remains a bounded sample/evaluation mode. Full private
authoring, Git, diagnostics, reviews, semantic comparison, and reporting
require the companion because browsers cannot safely own local files,
processes, or credentials.

From a qualified source checkout:

```bash
npm ci
npm run workbench:companion -- \
  --workspace-file /absolute/path/to/sysml-workspace.yaml
```

The exact-engine release bundle exposes:

```text
bin/start-pages-companion.sh <workspace-file>
bin/start-pages-companion.cmd <workspace-file>
```

The launcher opens `https://haitaowu12.github.io/sysmlv2_viewer/`, places only
the loopback service origin and a short-lived pairing code in the URL fragment,
and keeps the service attached to the launcher process. The page immediately
removes that fragment and receives an opaque workspace handle. The local
filesystem path is not placed in the URL or pairing response.

Keep the launcher terminal open. Closing it stops the companion.

The current non-desktop bundle requires supported Node.js 22 and Java 21 on
the machine. Self-contained companion packages and clean-machine evidence are
required before a public OS support claim.

## Desktop technical candidate

The current `0.7.0-rc.1` artifact is an ad-hoc-signed macOS arm64 technical
candidate. It embeds Node.js 22 and a minimized Java 21 runtime; system Node or
Java is not required. Public distribution is blocked by Developer ID signing,
Apple notarization, clean-machine OS evidence, manual accessibility evidence,
and the independent usability pilot.

## Install the future notarized desktop package

1. Open the notarized DMG.
2. Drag **SysML Engineering Workbench** to Applications.
3. Launch the application and select the project's
   `sysml-workspace.yaml`.
4. Confirm the workspace opens and the network indicator remains local-only.

The application contains both language engines and the pinned official
library. Network access is not required after installation. The internal
loopback service must not be exposed through a proxy, tunnel, or non-loopback
bind.

Until Developer ID and notarization evidence exists, the technical candidate
is restricted to controlled internal evaluation. Do not bypass Gatekeeper to
present it as a public production release.

## Deployment boundaries

- GitHub Pages without a companion is sample/evaluation only.
- GitHub Pages with the explicitly paired companion is the recommended
  no-Apple-signing path and preserves local/private model authority.
- The legacy viewer is available only through `?legacy=1` for read-only
  compatibility samples.
- Remote/shared deployment is unsupported until authentication, authorization,
  tenant isolation, and a separate threat-model amendment are implemented.
