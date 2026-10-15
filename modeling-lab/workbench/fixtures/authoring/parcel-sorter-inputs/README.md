# Fictional parcel-sorter input fixture

This is an author-independent fictional input fixture prepared before model production. It is not a blind real-user benchmark, a practitioner trial, a real commissioning record or evidence of operational capability. All names, values, dialogue and records are invented for a bounded evaluation.

The input author has not inspected a producer model, authored SysML for this case or run a language engine against it. `evaluation.json` is a separately frozen semantic oracle; keep it withheld from the model-producing agent until the candidate is recorded. It states facts and unacceptable inferences without prescribing SysML constructs or syntax.

Use the frozen pack in this order:

1. Initial intake: supply `brief.md`, `interfaces-r1.csv` and the initial section of `dialogue.md`.
2. One clarification: ask what acknowledgement means, then supply the clarification section of `dialogue.md`. The answer confirms the disagreement; it does not authorize a choice.
3. Record the candidate and its questions before inspecting `evaluation.json`.
4. Change exercise: supply `interfaces-r2.csv` and `lifecycle.json`. The changed ICD bound is source evidence; it does not authorize an actuator remedy or establish timing compliance.

The human/agent occurrence task selects **ParcelSortingStudy::sorter::diverterB::actuator**. This is an evaluation identity contract for this fictional package, not proof that names persist across arbitrary model revisions. The sibling occurrence is `ParcelSortingStudy::sorter::diverterA::actuator`; both use the shared `RotaryActuator` definition.

No real participant tasks have been performed. A subsequent fixed task set should ask a participant to identify the selected occurrence, locate its source, distinguish planned checks from observations, and explain the acknowledgement conflict. Any material false assurance fails the task regardless of speed.

`freeze-manifest.json` records SHA-256 for every other fixture file. It intentionally excludes itself. The freeze protects input/oracle identity; it does not certify model fidelity, runtime correctness or human acceptance.
