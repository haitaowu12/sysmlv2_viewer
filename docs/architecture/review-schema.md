# Review Schema

Reviews are schema-versioned JSON under `reviews/`. Creation freezes a Git
baseline, semantic snapshot hash, and either a saved view or bounded query.
Participants are named role records.

Each finding has exactly one stable element or relationship anchor, its
fingerprint at creation, severity, category, statement, optional owner/due
date, disposition, response, evidence references, timestamps, actor, and
append-only history.

Allowed finding dispositions are open, accepted, rejected, deferred, and
closed. A response is mandatory for a transition. A review cannot close with
an open finding. Staleness reports `anchor-changed` or `anchor-deleted` by
comparing the stored fingerprint with the current normalized snapshot.

The executable validator and transition table are in
`packages/review-service/src/index.ts`. UI or external tools must call the
Workbench Service rather than editing a live review file concurrently.
