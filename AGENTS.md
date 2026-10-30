# SysML v2 Viewer project instructions

Use README.md and the affected application/modeling contracts and tests for repository-specific work. Frontend guidance does not change model semantics, engineering claims or release authority.

## Frontend design and delivery

For frontend creation, substantial redesign, or recurring design complaints, read [.agents/skills/frontend-skill/SKILL.md](.agents/skills/frontend-skill/SKILL.md) before selecting a shell or writing UI code. It is the project-local snapshot of the maintained design method. Use its affected delivery checks for narrow UI changes; backend-only work does not load this branch.

Keep this project's domain semantics, accepted design decisions, scope and tests authoritative. Evaluate product structure, visual language and interaction on a representative task before extending the design. Preserve factual qualifications, units, warnings and working behavior. Inspect the final rendered result and exercise the affected journey; distinguish package availability, visual judgment, interaction evidence and release status.

Check this package without any global installation or sibling checkout:

```sh
python -B .agents/skills/frontend-skill/scripts/frontend_capsule.py inspect --out .agents/skills/frontend-skill
```

This check verifies bundled files, metadata and local links, not model activation or design acceptance. SOURCE.json records its canonical source revision; edit project design decisions outside the generated package. Use the canonical export/check workflow to update it without overwriting local changes.
