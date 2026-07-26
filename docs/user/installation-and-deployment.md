# Installation and Deployment

## Initial production profile

The first release profile is the self-contained SysML Engineering Workbench
desktop application for Apple Silicon on macOS 13 or later. The native host
opens a `sysml-workspace.yaml`, verifies the bundled runtime, starts the
Workbench Service on an operating-system-selected loopback port, and pairs the
embedded UI using short-lived credentials.

The current `0.7.0-rc.1` artifact is an ad-hoc-signed macOS arm64 technical
candidate. It embeds Node.js 22 and a minimized Java 21 runtime; system Node or
Java is not required. Public distribution is blocked by Developer ID signing,
Apple notarization, clean-machine OS evidence, manual accessibility evidence,
and the independent usability pilot.

## Install

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

## Other profiles

- GitHub Pages is a read-only compatibility demo only.
- The browser plus local companion remains available for development and
  controlled companion deployments, but is not the initial public channel.
- Remote/shared deployment is unsupported until authentication, authorization,
  tenant isolation, and a separate threat-model amendment are implemented.
