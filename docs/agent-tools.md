# SysML Agent Tools

The viewer exposes its existing parser and semantic bridge through a read-only JSON command surface. Source files remain canonical. These tools do not modify models, apply patches, write repositories, or prove official SysML v2 conformance.

## Commands

```bash
npm run sysml:tools -- doctor [model.sysml ...]
npm run sysml:tools -- check model.sysml [more.sysml ...]
npm run sysml:tools -- explain-diagnostic unsupported:calc
npm run sysml:tools -- model-summary --max-elements 100 model.sysml
npm run sysml:tools -- review --reviewer completeness model.sysml
npm run sysml:tools -- review --reviewer interface model.sysml
npm run sysml:tools -- trace-coverage model.sysml
npm run sysml:tools -- render-view model.sysml
```

File commands accept only `.sysml` files inside the current working directory by default. Use `--root /approved/workspace` to authorize a different bounded root. Real paths are checked after symlink resolution; file count and byte limits apply.

`check` exits `0` when no error-severity diagnostics exist and `1` when errors exist. Contract or invocation errors exit `2`. All outcomes write one JSON object to standard output.

## Shared Envelope

Every successful tool response includes:

- `schemaVersion`
- tool and engine identity
- package version
- pinned official release-corpus repository, tag, and commit
- examined files and byte counts
- structured diagnostic codes, severity, source locations, suggestions, and context
- explicit truncation totals

`model-summary` returns separate diagnostic and element truncation records. Summaries contain compact semantic nodes and edge counts, not the full AST.

## Authority Boundary

- Viewer parser: fast local supported-subset diagnostics and semantic summaries.
- Official release corpus: pinned regression fixtures and compatibility evidence.
- Official implementation or selected target tool: separate import and round-trip release evidence.
- TW Model: evidence, maturity, authority, currentness, review, and claim controls.

Parser success alone does not prove engineering validity, target-tool compatibility, or OMG conformance.

For release-stage Eclipse/Xtext validation, `tools/eclipse-validator` provides a small headless OSGi application that imports pinned official library and model projects, performs a clean Xtext build, and emits problem markers as JSON. Keep its result separate from the iterative local engine and bind it to exact runtime, plugin, corpus, and model hashes.

## Commit-Pinned Repository Queries

Programmatic adapters exported from `src/agent-tools` provide commit history, model summary, element, relationship, requirement, interface, and quality queries. Every request requires a repository path and exact reachable 40/64-character commit ID. Content comes from `git show <commit>:<path>`; dirty working-tree content is ignored. Symbolic, missing, and unreachable commits fail closed with redacted errors. No mutation verb exists.

## Deterministic Reviewers

CLI and programmatic completeness, traceability, requirement-parent, interface, semantic-compatibility, and release reviewers consume the same parser and semantic engine. Select one with `review --reviewer <name>`. Findings include stable rule IDs, model evidence IDs, source locations, rationale, proposed disposition, explicit limitations, and `requiresHumanReview: true`. Reviewers never rewrite source. The completeness reviewer fails explicit omissions such as missing use-case subjects, actors, objectives, contextual bindings, composite sequencing, requirement subjects, and verification subjects/objectives.

Project rule packs remain separate because parser structure alone cannot prove ownership, direction, units, timing, state applicability, source currentness, or domain compatibility.

`trace-coverage` reports requirement definitions separately from requirement usages and names only relationship presence (`satisfactionLinked`, `verificationLinked`). It explicitly does not claim satisfaction evidence or a passed verification verdict. `render-view` exposes the deterministic Mermaid projection. Programmatic `sysmlCompareModels` adds semantic model deltas. All remain read-only and carry engine/corpus/file identity.
