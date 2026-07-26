# Migration Guide

The previous browser Viewer is not the production authority. Existing `.sysml`
and `.kerml` files remain source input; create `sysml-workspace.yaml` and place
them under authorized roots. Verify syntax against the selected 2026-05
language profile before accepting diagnostics or generated evidence.

Not migrated:

- IndexedDB/browser-only authoritative state;
- old URL routes and fixed diagram ids;
- arbitrary Draw.io XML as model meaning;
- name/line-based review anchors;
- legacy AI chat history or whole-document AI edits;
- parser/store undo history.

Draw.io may remain as presentation/export compatibility. Recreate valuable
layouts as saved view positions keyed by stable identities. Recreate reviews
against a Git baseline and current identities; do not translate line-number
comments automatically.

For a project:

1. create a clean Git baseline;
2. add and validate workspace roots/libraries;
3. open with the qualified language runtime;
4. resolve blocking diagnostics and inspect opaque constructs;
5. create the identity registry and saved views;
6. re-anchor valuable findings manually with reviewer confirmation;
7. generate a baseline manifest and evidence;
8. retain the old export as a read-only migration record.

No converter is provided for undocumented browser caches because they were not
a durable product contract.
