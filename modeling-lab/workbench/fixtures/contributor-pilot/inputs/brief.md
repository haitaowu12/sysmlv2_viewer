# Contributor pilot brief

This is fictional test data for the typed requirement/interface contributor workflow. It is an interaction contract, not a project requirement, a performance report or a participant study.

The controlled baseline is **A**. A controller exchanges a typed request and a typed acknowledgement with two field-equipment occurrences, `FIELD-A` and `FIELD-B`. Baseline A declares that a control acknowledgement is returned within **120 ms** of request receipt. A historical observation at `FIELD-A` recorded **95 ms** against A. The observation is retained for applicability review and is not evidence that the requirement was verified.

Candidate baseline **B** proposes **80 ms**. The meaning of “acknowledgement” remains unresolved: it may refer to an accepted dispatch message or to completion of the field action. The contributor must preserve both interpretations as an open question.

The input intentionally includes an ambiguous interface row. The contributor must select the existing `FIELD-A` identity and confirm that the latency unit is milliseconds before submitting a typed change. An invalid unit and an unknown reference must be rejected before apply.

The model contains an unrelated advanced state declaration and a comment marker. Both must survive the targeted change, undo, and reopen sequence byte-for-byte at the source-fragment level unless the product explicitly records a reviewed formatting change.
