# SysML Agent Tools

The viewer exposes its existing parser and semantic bridge through a read-only JSON command surface. Source files remain canonical. These tools do not modify models, apply patches, write repositories, or prove official SysML v2 conformance.

## Commands

```bash
npm run sysml:tools -- doctor [model.sysml ...]
npm run sysml:tools -- check model.sysml [more.sysml ...]
npm run sysml:tools -- explain-diagnostic unsupported:calc
npm run sysml:tools -- model-summary --max-elements 100 model.sysml
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

## Commit-Pinned Repository Queries

Programmatic adapters exported from `src/agent-tools` provide commit history, model summary, element, relationship, requirement, interface, and quality queries. Every request requires a repository path and exact reachable 40/64-character commit ID. Content comes from `git show <commit>:<path>`; dirty working-tree content is ignored. Symbolic, missing, and unreachable commits fail closed with redacted errors. No mutation verb exists.

## Deterministic Reviewers

Programmatic traceability, requirement-parent, interface, and release reviewers consume the same semantic engine. Findings include stable rule IDs, model evidence IDs, rationale, proposed disposition, explicit limitations, and `requiresHumanReview: true`. Reviewers never rewrite source. Project rule packs remain separate because parser structure alone cannot prove ownership, direction, units, timing, state applicability, or domain compatibility.

Programmatic `sysmlRenderView`, `sysmlTraceCoverage`, and `sysmlCompareModels` tools add deterministic Mermaid projection, explicit requirement coverage, and semantic model deltas. They remain read-only and carry engine/corpus/file identity.
