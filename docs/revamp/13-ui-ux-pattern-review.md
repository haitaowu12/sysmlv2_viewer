# UI/UX Pattern Review

## Experience thesis

The workbench combines an IDE’s precision with an engineering review room’s accountability. It is not a collection of diagram tabs and not a developer-only text editor.

Research patterns:

- [VS Code](https://code.visualstudio.com/docs/editing/userinterface): activity rail, configurable views, command palette, Problems, quick open, source control, diff;
- [JetBrains](https://www.jetbrains.com/help/idea/project-analysis.html): visible indexing, semantic search, inspections, refactor preview, scopes, find usages;
- [GitHub review](https://docs.github.com/en/pull-requests/reference/pull-request-reviews): immutable change set, line/element discussion, approve/request changes, required checks;
- [Jama Trace View](https://internal-help.jamasoftware.net/ah/en/get-started/getting-started/exploring-the-jama-connect-workspace/trace-view.html): relationship-rule gaps in context;
- commercial MBSE/CAD/CAE: schema-aware property inspectors, synchronized selection, compartments, layers, filters, model validation;
- Capella/Arcadia: question- and method-oriented viewpoints rather than arbitrary diagram taxonomies.

## Shared shell

```text
top: workspace / configuration / branch / baseline / network / indexing health
left activity rail:
  Explorer | Model | Views | Traceability | Interfaces | Verification
  Reviews | Changes | Reports | Settings
left pane: selected navigator/query/view library
centre: editor, diagram, matrix, report, or baseline comparison
right: properties / relationships / diagnostics / review
bottom: Problems / Output / Query / Changes / Service Health
```

This React/web shell is identical in browser, Tauri, and hosted profiles. Deployment-specific actions appear through negotiated capabilities.

## User-class journeys

| User | Landing state | Primary work | Required browser-only path |
|---|---|---|---|
| author | workspace health and recent source/views | edit/refactor, diagram commands, diagnostics | use local companion or hosted authoring |
| engineer/reviewer | assigned review/query and impacted items | navigate, trace, comment, dispositions, compare | complete without desktop |
| chief/assurance | coverage/readiness/risk dashboard | freeze scope, assess evidence, approve closure | complete without desktop |
| PM/stakeholder | published baseline and decision views | read, compare, comment, approve/reject invited disposition | complete without desktop |

Non-modelers see engineering terms, scoped views, and evidence—not package trees by default. Source remains one click away for authorized users.

## Workspace opening

1. Select recent workspace, local companion, hosted workspace, or public sample.
2. Show deployment profile, connection trust, requested capabilities, source roots, library/release lock, and model configuration.
3. Report indexing stages separately: discovery, libraries, parse, resolve, semantic snapshot, rules.
4. Reveal first useful explorer content progressively with stale/current labels.
5. Block only affected operations; configuration/authority errors remain prominent.
6. Reopen committed views/reviews/layouts without browser-local authority.

## Navigation and selection

- stable identity drives synchronized selection across source, tree, diagram, matrix, property, review, and diff;
- explorer mode is explicit: containment, type, dependency, neighbourhood, requirements, verification, interface;
- definition vs usage and owned vs inherited are never distinguished by color alone;
- unresolved/opaque items retain source location and reason;
- breadcrumbs show workspace → package → membership → element, with definition/type link;
- “Find in views,” “Find references,” and “Impact from baseline” are separate operations.

## Authoring and mutation

Direct text editing uses Monaco plus LSP. Every non-text operation follows:

```text
intent → typed command → source patch preview → diagnostics delta
       → semantic diff → explicit apply → receipt/undo
```

The preview defaults to semantic changes for non-programmers and exposes exact source diffs. Conflicts, opaque ranges, stale base snapshots, and unsupported engine capabilities stop apply.

Bulk table edits show affected count, validation result, partial-failure policy, and one transaction receipt. AI uses the same proposal surface with citations and assumptions.

## Review and change experience

- a review opens at an immutable baseline and frozen query scope;
- findings anchor to stable element/relationship identity and show current staleness;
- disposition states: open, responded, accepted, rejected, deferred, closed;
- changes combine source diff, semantic categories, diagram overlay, affected traces, diagnostic delta, and review impact;
- rename/move commands remain rename/move when identity receipts prove continuity;
- approvals record actor, time, exact proposal/baseline, evidence, and rule versions.

Borrow GitHub’s explicit decision vocabulary, not its line-only anchors.

## Diagram and matrix interaction

- palette contents derive from diagram profile and negotiated command capability;
- invalid drops/connects explain the semantic rule;
- expand neighbourhood is bounded and previewed;
- filters are visible as chips and included in exports;
- a table alternative is always reachable and preserves selection;
- layouts are separately versioned so semantic and layout changes compare independently;
- dense diagrams open with a scoped question, not “show everything.”

## Accessibility and usability gates

- full keyboard path for opening, navigating, inspecting, editing supported properties, proposing/applying, reviewing, and exporting;
- command palette exposes every primary action;
- screen-reader names include kind, name, state, and relationship role;
- logical focus order follows shell regions;
- WCAG contrast; status always has text/icon;
- scalable text and responsive panels;
- reduced-motion mode;
- diagram table/tree alternative;
- shortcuts shown contextually and remappable;
- empty states explain the next safe action.

Practical pilot tasks and metrics:

| Task | Success evidence |
|---|---|
| open sample | correct release/configuration and first content without help |
| find unresolved reference | navigate Problems → source → related context |
| requirement to satisfying element | trace path and basis visible |
| identify unverified requirement | rule provenance and actionable gap |
| add interface | command/source/semantic preview understood |
| compare baselines | requirement/interface changes and impacts identified |
| close finding | disposition/evidence recorded at correct baseline |
| export interface report | deterministic manifest verified |

Record completion, time, errors, backtracks, assistance, and repair action. Gate P4 requires completion without developer intervention, not merely favorable screenshots.

## Patterns rejected

- seven fixed diagram tabs;
- modal forms that hide source effects;
- one flattened property list;
- silent auto-import/refactor;
- spinner-only indexing;
- color-only diagnostics or diff;
- desktop-only review consumption;
- web “demo” that cannot perform real scoped review;
- separate UI implementations per deployment.
