# Official Eclipse Validator Bridge

This small Eclipse application imports one or more existing Xtext projects, runs a clean workspace build, and emits SysML problem markers as JSON. It exists to make the official Eclipse/Xtext gate repeatable without replacing the local iterative parser.

When `--roundtrip-output DIR` is supplied and the build has no errors, the same official Xtext resource implementation loads and serializes every SysML resource into a project-named subtree under `DIR`. Stock serialization remains the default. `--roundtrip-mode bridge-filtered` is an experimental lane that marks generated `Element.elementId`, generic relationship endpoints, and metamodel-declared relationship-source subset features transient, and re-wraps stored documentation bodies as regular comment tokens. Grammar-explicit target features remain serializable. It does not mutate the model or Ecore metadata. Compare outputs semantically and validate them again before making any preservation claim.

## Boundary

- Use only with an official SysML release plugin and the matching pinned `sysml.library` project.
- Record Eclipse, Java, plugin, corpus, and model hashes with every result.
- A zero-marker result proves only that the supplied project set builds without SysML problem markers in the stated runtime.
- `bridge-filtered` output is not stock official serialization. It must be labelled as bridge-filtered textual serialization in every evidence record.
- Every serialized output is rejected if it has EMF-binary magic, contains NUL bytes, or is not valid UTF-8.
- It does not prove engineering validity, approval, or semantic round-trip preservation.

## Build and install

Set `ECLIPSE` to the Eclipse application directory containing `Contents/Eclipse/plugins`.

```bash
mkdir -p tools/eclipse-validator/target/classes
CLASSPATH=$(find "$ECLIPSE/Contents/Eclipse/plugins" -maxdepth 1 \
  -name '*.jar' ! -name '*.source_*' -print | paste -sd: -)
javac -cp "$CLASSPATH" \
  -d tools/eclipse-validator/target/classes \
  $(find tools/eclipse-validator/src -name '*.java' -print)
jar cfm tools/eclipse-validator/target/local.sysml.validator_1.0.0.jar \
  tools/eclipse-validator/META-INF/MANIFEST.MF \
  -C tools/eclipse-validator/target/classes . \
  -C tools/eclipse-validator plugin.xml
```

Publish the bundle as a local p2 repository with `org.eclipse.equinox.p2.publisher.FeaturesAndBundlesPublisher`, then install IU `local.sysml.validator` using the p2 director. This avoids relying on untracked drop-in discovery.

Run the dependency-free output-guard test before packaging:

```bash
bash tools/eclipse-validator/test-text-output-guard.sh
```

With `ECLIPSE` set as above, characterize the exact implied
`PortConjugation.originalPortDefinition` filter:

```bash
bash tools/eclipse-validator/test-port-conjugation-transient-rule.sh
```

## Run

The first project should be the pinned official `sysml.library`; the final project should contain the model under review and reference `sysml.library` in `.project`.

```bash
"$ECLIPSE/Contents/MacOS/eclipse" -nosplash \
  -data /absolute/path/to/isolated-workspace \
  -application local.sysml.validator.application \
  /absolute/path/to/SysML-v2-Release/sysml.library \
  /absolute/path/to/model-project
```

For an official parse/serialize round trip:

```bash
"$ECLIPSE/Contents/MacOS/eclipse" -nosplash \
  -data /absolute/path/to/isolated-workspace \
  -application local.sysml.validator.application \
  --roundtrip-output /absolute/path/to/serialized-output \
  /absolute/path/to/SysML-v2-Release/sysml.library \
  /absolute/path/to/model-project
```

Use a fresh isolated workspace for release evidence. Preserve the JSON result and all input hashes.

For the explicitly experimental bridge-filtered lane:

```bash
"$ECLIPSE/Contents/MacOS/eclipse" -nosplash -clean \
  -data /absolute/path/to/fresh-isolated-workspace \
  -application local.sysml.validator.application \
  --roundtrip-output /absolute/path/to/serialized-output \
  --roundtrip-mode bridge-filtered \
  /absolute/path/to/SysML-v2-Release/sysml.library \
  /absolute/path/to/model-project
```

Accept this lane only when the emitted file is UTF-8 text, official clean re-import returns zero markers, and an independent semantic comparison reports zero deltas. A bridge-filtered pass does not convert the stock serializer result into a pass.

The pinned official port-conjugation characterization is recorded in
`evidence/port-conjugation-characterization-2026-07-12.json`. The exact
`PortConjugation.originalPortDefinition` filter passes serialization, but the
official serializer's separate quoted-name output currently fails re-import;
therefore the textual round-trip claim remains held.
