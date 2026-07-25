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
