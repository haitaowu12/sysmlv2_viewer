# VinQut/Pilot semantic evidence extension

This source overlay is applied to VinQut commit
`373dfb960860c3ac259f56169ddabc06d2847eca`, after its `server/lib`
artifacts and `sysml-library.xtext-index` are rebuilt from Pilot commit
`fa709f28dfd49dfdb7ee83e4e19da2f57e0eb3aa` and the official `2026-05`
library release.

The extension adds one read-only JSON-RPC method: `sysml/semanticEvidence`.
It returns resolved Pilot EMF element metaclasses and explicit, non-derived
`EReference` evidence. It does not mutate source, create semantics, or expose
the Pilot model as a second authority.

Copy the two Java files into
`server/src/main/java/org/omg/sysml/lsp/`, then apply
`vinqut-semantic-evidence.patch` from the VinQut repository root. Build with:

```bash
cd server
./gradlew clean shadowJar
shasum -a 256 build/libs/sysmlv2-lsp-server.jar
```

`isPreserveFileTimestamps = false` and `isReproducibleFileOrder = true` make
the selected runtime artifact reproducible. The qualified Phase 2 artifact is
locked in `config/language-engine-runtime-lock.json`.

## Optional candidate validation contract

The current overlay also supports `document-diagnostics-v1`. In one Xtext
`doRead` context, it captures the actual document version and UTF-8 source
SHA-256 and runs `CheckMode.ALL` validation. The response returns typed
diagnostics, `diagnosticsComplete`, and any explicit `diagnosticsError`. It
does not stamp a current version onto an asynchronous notification.

Select this contract only with a candidate manifest whose VinQut entry includes
`"semanticEvidenceValidation": "document-diagnostics-v1"` alongside the method.
The adapter requires exact URI, version, source digest and successful completion
before accepting corrective diagnostics. Missing or inconsistent evidence keeps
existing errors visible. This overlay requires a separate candidate artifact
and lock; the default product manifest and production lock are unchanged. See
[the contributor pilot](../../docs/contributor-pilot.md) for the candidate build
and qualification procedure.
