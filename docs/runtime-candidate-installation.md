# Rebuilt runtime and local installation candidate

The rebuilt VinQut runtime remains an explicitly selected candidate. Packaging
copies its manifest and runtime lock into the archive; it does not change the
production defaults in `config/`. The candidate JAR SHA-256 is
`4d79359b4ef2c2737f9713f65947147c6a3941d119a9985d139a56d10dafda4e`.
Its correlated semantic evidence returns diagnostics for the same document
version and bytes. The separate runtime-gate and contributor qualification
records determine which workflows this candidate has passed.

## Package and run

Use an Apple Silicon macOS build host with the source-owned package-lock
installation, Node 22 and a Java 21 JDK. Build with `npm run build` first. Run
`workbench-package-release.ts` with explicit `--runtime-lock`,
`--candidate-manifest`, `--semantic-artifact`, `--authoring-artifact`,
`--library-root`, `--semantic-license-root`, `--pilot-license` and `--output`.
The official library must be the exact Git checkout identified by the lock.
The packager verifies both engine artifact hashes. These are build-time paths;
they do not become launcher dependencies.

Then use the existing companion assembler's local profile:

```sh
npx tsx scripts/workbench-package-companion.ts \
  --portable-bundle /path/to/portable-bundle \
  --node-executable /path/to/node22/bin/node \
  --java-home /path/to/java21/Contents/Home \
  --output /path/to/distribution --local-ui
```

Both stages reject a dirty checkout unless `--allow-dirty` is explicitly used.
Such output is development evidence and cannot qualify the release. A final
artifact must be rebuilt against the clean committed source. Both stages
record the exact source commit, runtime inventory, licenses and archive hash.

Extract the resulting `*-local-candidate-darwin-arm64.tar.gz` into a new
versioned directory. It includes local UI assets, service, Node 22, minimized
Java 21, Spec42, official library and a sample workspace. No npm installation,
Java download or absolute developer path is required at runtime.

```sh
./bin/start-local-workbench.sh --doctor
./bin/start-local-workbench.sh --sample "$HOME/Workbench-pilot" --sample-profile contributor-phase2
# Subsequent launches:
./bin/start-local-workbench.sh "$HOME/Workbench-pilot/sysml-workspace.yaml"
```

The phase2 sample demonstrates quantity, reference and interface-agreement editing.
Omit `--sample-profile` to use the original scalar/documentation pilot.
Open the loopback URL printed by the launcher. `--port 4318` selects another
port if 4317 is occupied. The launcher does not choose or open a browser. It
verifies all installed files and clears inherited Node/Java injection settings
before launching. The sample must be copied outside the immutable installation
and an existing destination is never overwritten. Workspace/model source and
review state remain outside the installation. Git branch/commit operations
require Git; basic model editing uses the local service.

## Qualification boundary

Run:

```sh
npx tsx scripts/workbench-smoke-local-installation.ts \
  --archive /path/to/local-candidate-darwin-arm64.tar.gz \
  --output /path/to/isolated-installation.json
```

This extracts the archive into a new temporary directory (including paths with
spaces), creates a fresh HOME and an unusable PATH, and launches only the
packaged runtimes. A macOS sandbox denies outbound network connections except
loopback. A negative connection probe must return EPERM/EACCES before the
service starts. The test verifies the local index and referenced initial UI
assets, CSP, one-time pairing, qualified hybrid authority, model snapshot and
zero semantic errors. It introduces an unknown type in the disposable sample,
requires authoritative errors, restores exact source and requires a clean
reopen. Tampered UI bytes and missing Java must fail before service startup;
restoring the payload must make its doctor pass again. Captured logs must not
contain the sample marker or session credentials.

This is automated isolation on the development Mac. It does not establish a
separate clean-machine installation, Gatekeeper/quarantine behavior, signed or
notarized distribution, Windows support, a human task-completion time, or every
lazy UI path. The final in-app browser check covers the contributor task; the
service smoke is not a substitute for that check. The external archive hash is
the integrity anchor: replacing both manifest and payload is beyond the
included verifier's guarantee.

## Recovery

Keep the previous versioned archive and workspace backup. Stop the current
service before switching versions. Start the prior installation against a
compatible backup; retain newer workspace data separately rather than
silently overwriting it. This launcher performs no schema migration and no
automatic runtime adoption. The smoke test proves payload restoration and
baseline-source recovery, not downgrade compatibility for every future schema.
