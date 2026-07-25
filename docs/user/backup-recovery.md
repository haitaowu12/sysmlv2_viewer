# Backup and Recovery

Back up the entire project at a Git-clean point, including source, workspace
configuration, views, reviews, baselines, evidence, and `.sysml-workbench/`.
Do not back up only generated reports.

Before restoring:

1. stop the Workbench Service;
2. preserve the current project as a forensic copy;
3. verify the release bundle separately with `node bin/verify-bundle.mjs`;
4. restore the project to an authorized local path;
5. inspect `.sysml-workbench/commands/` for an incomplete transaction;
6. reopen and compare diagnostics, identity registry, Git status, and reviews.

Command writes use recovery journals and atomic replacement. The identity
registry maintains a `.bak` recovery copy. Do not manually delete a journal or
substitute an identity registry while the service is running. If both registry
copies are damaged, restore from the last complete project backup; generating
new identities can orphan review and evidence anchors.

Reports are reproducible from the bound source commit, baseline, view/rule
versions, and tool version. Regenerate them after source restoration rather
than editing report files.
