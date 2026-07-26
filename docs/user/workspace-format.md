# Workspace Format

`sysml-workspace.yaml` schema version 1 is the project entry point:

```yaml
schemaVersion: 1
id: omc4-pilot
name: OMC4 Interface Assurance
sourceRoots:
  - model
libraries:
  - libraries/domain
activeConfiguration: operational
modelConfigurations:
  operational:
    sourceRoots:
      - model
    libraries:
      - libraries/domain
  minimal:
    sourceRoots:
      - model/core
    libraries: []
```

`sourceRoots` is mandatory and non-empty. `libraries` is optional.
`activeConfiguration`, when present, must name an entry in
`modelConfigurations`. A selected configuration replaces the top-level roots;
it does not merge them.

All paths are relative to the directory containing the workspace file and must
remain inside the service-authorized workspace root. The loader recursively
collects `.sysml` and `.kerml`. Source-root symlinks are rejected, including
symlinks that happen to resolve inside the project. Default limits are 2,000
files and 128 MiB aggregate source unless the service host supplies lower
limits.

Workspace-owned artifacts:

- `views/*.json`: schema-versioned query/notation/layout configuration;
- `reviews/*.json`: baseline-frozen model reviews and history;
- `baselines/*.json`: Git commit and semantic snapshot manifests;
- `generated/reports/`: deterministic reports and manifests;
- `.sysml-workbench/identity-registry.json`: stable identity aliases and
  tombstones;
- `.sysml-workbench/commands/`: recovery journals and receipts;
- `.sysml-workbench/audit/ai/`: tamper-evident AI operation records.

Canonical model meaning remains in source. Caches are disposable; review,
baseline, identity, and audit state is not.
