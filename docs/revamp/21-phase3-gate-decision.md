# Phase 3 Command Editing Gate Decision

- Date: 2026-07-25
- Base: Gate P2 merge `e018dc8cde07a3a9b2a4da2ef33680f7c5d4d9cf`
- Branch: `codex/sysml-workbench-phase3-command-editing`
- Decision: **Gate P3 accepted; PR merge pending**
- Production claim: **not authorized**; P4-P7 remain required

## Acceptance decision

| Gate P3 criterion | Evidence | Result |
|---|---|---|
| typed mutations | versioned command union and conservative structured edit profile | pass |
| explicit source edits | public proposal contains bounded workspace edits; internal overlays never cross protocol | pass |
| diagnostics before/after | qualified authority validates temporary overlays | pass |
| semantic diff preview | identity-aware diff included before approval | pass |
| no silent apply | source hash verified unchanged until human approval | pass |
| atomic apply | fsynced backups/journal, atomic replace, directory sync, final hash verification | pass |
| conflicts | stale snapshot/document, overlap, scope, external writer, and recovery conflict fail closed | pass |
| identity | rename/move migration plus full after-snapshot registry reconciliation committed with source | pass |
| undo/redo | durable audit-sourced current-head proposal and new approval transaction | pass |
| audit | public proposal, approval, expected semantic snapshot, edits, and undo retained in durable journal | pass |
| preservation | complete engine ranges only; opaque/truncated ranges reject; unknown adjacent bytes remain unchanged | pass |
| native consumer | structural/interconnection editor creates typed commands and requires patch review/approval | pass |
| exact runtime | locked VinQut/Pilot + Spec42 create/apply/undo/reopen qualification | pass |
| clean detached-worktree reproduction | `597917d` with fresh `npm ci` | pass |
| GitHub exact-head CI | Actions run `30174852722`, implementation/evidence head `d967e98` | pass |

## Exact-runtime result

The locked runtime accepted a new typed `PortUsage` with zero diagnostics. The
proposal produced an `element-created` semantic diff without changing source.
Human approval finalized a durable transaction. Undo finalized a second
transaction, restored the source SHA-256 exactly, restored the original semantic
snapshot SHA-256, and survived a clean workspace reopen.

Authority lock:

- SysML reference release `2026-05` at
  `de1070ae8e79c21532b8004fc663d47b35d0e9fa`;
- VinQut/Pilot semantic artifact
  `8dc941e0e83fbdd063ee2e9148840fa2d5b80ad72f27d22c8267e61db52a5160`;
- Spec42 authoring artifact
  `22911d70f7f41251e257aef3ae4a3a402e77063d2271ed394a114834d7ee362e`.

## Remaining limits

- The source renderer intentionally supports only known declaration shapes and
  simple identifiers. Quoted names and ambiguous source shapes fail closed.
- Relationship templates still require proposal-by-proposal authoritative
  validation; a template is not evidence that every language context accepts it.
- Retention/cleanup policy for journal backups is a P7 security/recovery task.
- The native command editor is not yet integrated into the P4 primary shell.
- Platform fault injection is currently exercised on macOS; Windows installer
  and filesystem behavior remain P7 evidence.

## Clean reproduction

Detached commit `597917d` passed from a fresh dependency install:

- 14 Workbench test files / 56 tests;
- 33 repository test files / 206 tests;
- one optional upstream file / 19 optional tests skipped by declared policy;
- lint, TypeScript builds, Vite production build, and production audit;
- zero production dependency vulnerabilities;
- exact locked-runtime Phase 3 qualification from the same detached commit.

Gate P3 is accepted on the combined mandatory tests, fault/recovery evidence,
locked-runtime qualification, detached clean reproduction, and exact-head CI.
This advances the staged program to P4; it does not authorize a production
release.
