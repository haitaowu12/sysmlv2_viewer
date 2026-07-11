# Official Eclipse Validator Bridge

This small Eclipse application imports one or more existing Xtext projects, runs a clean workspace build, and emits SysML problem markers as JSON. It exists to make the official Eclipse/Xtext gate repeatable without replacing the local iterative parser.

## Boundary

- Use only with an official SysML release plugin and the matching pinned `sysml.library` project.
- Record Eclipse, Java, plugin, corpus, and model hashes with every result.
- A zero-marker result proves only that the supplied project set builds without SysML problem markers in the stated runtime.
- It does not prove engineering validity, approval, or semantic round-trip preservation.

## Build and install

Set `ECLIPSE` to the Eclipse application directory containing `Contents/Eclipse/plugins`.

```bash
mkdir -p tools/eclipse-validator/target/classes
javac -cp "$ECLIPSE/Contents/Eclipse/plugins/*" \
  -d tools/eclipse-validator/target/classes \
  tools/eclipse-validator/src/local/sysml/validator/Application.java
jar cfm tools/eclipse-validator/target/local.sysml.validator_1.0.0.jar \
  tools/eclipse-validator/META-INF/MANIFEST.MF \
  -C tools/eclipse-validator/target/classes . \
  -C tools/eclipse-validator plugin.xml
```

Publish the bundle as a local p2 repository with `org.eclipse.equinox.p2.publisher.FeaturesAndBundlesPublisher`, then install IU `local.sysml.validator` using the p2 director. This avoids relying on untracked drop-in discovery.

## Run

The first project should be the pinned official `sysml.library`; the final project should contain the model under review and reference `sysml.library` in `.project`.

```bash
"$ECLIPSE/Contents/MacOS/eclipse" -nosplash \
  -data /absolute/path/to/isolated-workspace \
  -application local.sysml.validator.application \
  /absolute/path/to/SysML-v2-Release/sysml.library \
  /absolute/path/to/model-project
```

Use a fresh isolated workspace for release evidence. Preserve the JSON result and all input hashes.
