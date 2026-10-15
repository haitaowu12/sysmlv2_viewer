# Bundled SysML workbench

Run this workbench through `scripts/sysml.py` at the skill root. Runtime, fixtures, examples and contracts resolve within the same package. No audit checkout is required.

- [Agent query, candidate and review workflow](AGENT_WORKFLOW.md)
- [Model package assessment](MODEL_PACKAGE.md)
- [Evidence contract](EVIDENCE_CONTRACT.md)
- [Lifecycle boundaries](LIFECYCLE.md)

The raw Python commands in these technical references are relative to the `workbench` directory. The package launcher supplies the pinned runtime automatically. Source models and generated evidence belong outside the installed skill unless they are the included synthetic regression fixtures.
