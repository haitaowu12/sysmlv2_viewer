# Phase 7 Usability Pilot Protocol

Status: awaiting independent participants  
Artifact: `0.7.0-rc.1` internal unsigned candidate  
Scenario: `fixtures/workspaces/phase5-infrastructure`

Automated component and copied-bundle workflow tests do not satisfy this human
gate. Three people who did not implement the feature must complete the pilot
without developer intervention.

## Participant and environment record

Record participant id/role (no unnecessary personal data), operating system,
hardware, display/assistive technology, bundle SHA-256, source commit,
language/runtime hashes, start/end time, facilitator, and whether any hint was
provided. A hint makes that task assisted rather than passed.

## Tasks

| # | Task | Pass evidence |
|---|---|---|
| 1 | Install/open the sample workspace | verified bundle, paired session, qualified ready state |
| 2 | Find an unresolved reference | diagnostic code, source location, navigation path |
| 3 | Navigate requirement → satisfying element | identities and path used |
| 4 | Identify an unverified requirement | requirement identity and coverage result |
| 5 | Add an interface and inspect source edits | command id, patch preview, no pre-approval write |
| 6 | Compare two baselines | baseline ids and semantic change categories |
| 7 | Record, disposition, and close a finding | review/finding ids and closure state |
| 8 | Export an interface report | report manifest/path and provenance fields |

For every task record completion (pass/assisted/fail), elapsed time, wrong
turns, observed failure, severity, and repair action. Record keyboard-only and
screen-reader observations for at least one participant each. Do not include
proprietary model content in the study record.

## Acceptance

- all three participants complete all eight tasks;
- no critical usability, data-integrity, privacy, or accessibility issue stays
  open;
- assisted/failing paths have an owned repair and are rerun;
- manual contrast, zoom/scalable-text, focus order, status-without-color, and
  diagram-alternative checks pass;
- the owner signs the summarized evidence and residual findings.

Store completed records under `evidence/usability/` in the pilot project.
