# Installation and Deployment

## Qualified profile

The first release profile is an authenticated loopback companion serving the
browser UI at `http://127.0.0.1:4317`. It binds only loopback, validates Host
and exact Origin, and requires a one-time pairing code plus short-lived bearer
and CSRF credentials.

The current `0.7.0-rc.1` artifact is an unsigned macOS arm64 internal release
candidate. It requires Node.js 22 and Java 21. Public distribution is blocked
by product/runtime license reconciliation, signing/notarization, clean-machine
OS evidence, and independent usability-pilot evidence.

## Install

1. Copy the archive to a local installation directory.
2. Extract it without changing files inside the bundle.
3. Run `node bin/verify-bundle.mjs`.
4. Start `bin/start-workbench.sh /absolute/workspace/path`.
5. Open the printed loopback URL and enter the printed pairing code.

The release bundle contains both language engines and the pinned official
library. Network access is not required after installation. Do not expose port
4317 through a proxy, container port mapping, tunnel, or non-loopback bind.

## Other profiles

- GitHub Pages is a read-only compatibility demo only.
- A native desktop shell remains a packaging option over the same service
  protocol; it is not yet a release claim.
- Remote/shared deployment is unsupported until authentication, authorization,
  tenant isolation, and a separate threat-model amendment are implemented.
