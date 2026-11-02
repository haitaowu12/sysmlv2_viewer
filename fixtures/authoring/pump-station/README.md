# Pumping station qualification package

A second fictional system extends the cooler qualification with repeated components, nested decomposition, event-triggered states and a conflicting operating policy. It is an authored mixed-input exercise, not a blind held-out benchmark, client design or proof of general engineering competence.

The inputs are architecture prose, an interface CSV and a workshop record. The workshop includes a clearly fictional design-owner resolution for testing the resolved path. It is not Tony's approval or a real engineering authorization. Original positions remain in the evidence ledger.

## Model and intended claims

`model.sysml` owns the model. The station owns a controller and distinct duty/standby usages of the same PumpSkid definition. Each skid owns a motor. Three explicitly directed StartRequest exchanges span the external operator boundary and the two pump commands. Two bindings forward boundary ports. MotorStates specifies stopped/running/tripped, the stopped initial state and four event-triggered transitions. The installed-count requirement is structurally expressed and has satisfaction plus planned verification.

`installedPumpCount` is a declared design attribute, not a computed cardinality. `maximumRunningPumps=1` records the resolved operating limit, not an interlock or executed guarantee. Protocol, latency, physical performance, automatic failover and reset safeguards remain explicitly outside the accepted claims. This package is unsuitable for claiming a complete or safe operating design.

## Acceptance controls

- `contract.json`: 35 expected facts. The initial 34 expectations were specified from the input before source generation; one directed-flow assertion was added during review. The conjugated port type's qualified spelling was corrected to the engine's `Command::'~Command'` without changing the intended type.
- `evidence-contract.json`: exact source citations and 77 explicit declaration anchors, with original conflicts/unknowns retained. Anchors and intake hashes were bound after initial generation and are retrospective evidence; they are not independent evidence that generation was blind or extraction was automatic.
- `intake.json`: frozen source catalog for subsequent change review.
- `fact-support.json`: every expected fact maps to an analyst-reviewed source claim. The checker validates link completeness and supported status; it does not determine natural-language entailment or the legitimacy of a decision maker.
- `decisions.json`: the fictional policy resolution plus an open, explicitly excluded implementation-detail question. `decisions-unresolved.json` preserves the initial blocking condition.
- `package.json`: independent concern/scope/profile expectations, counted directed exchanges and the bounded source-declaration kind list. `package-unresolved.json` references the open decision register and must fail only the decision gate for the baseline model.

Eight projections share the same model revision: context, station interconnection, station decomposition, skid detail, motor states, capacity requirement, planned verification and an analytical exchange summary. The summary deliberately omits one named binding and retains evidence for the two summarized flows. These application presets are not native modeled SysML view/viewpoint declarations.

From the product root:

```sh
python3 -B tools/reference-pilot/assess_package.py \
  --package fixtures/authoring/pump-station/package.json \
  --jar /path/to/jupyter-sysml-kernel-0.52.0-all.jar \
  --library /path/to/sysml.library --output /path/to/new-assessment
```

Use `--report /path/to/report.json` in place of JAR/library arguments to assess an existing revision-bound report. This does not perform a fresh load. To inspect and edit a draft, start `lab.py` with `--source fixtures/authoring/pump-station/model.sysml --views fixtures/authoring/pump-station/views.json` and the pinned JAR/library. Edits are temporary; use the package gate after deliberate canonical changes and evidence review.

`pump_regressions.py` exercises five statically valid but unintended mutations: wrong state target, wrong trigger, missing state exhibition, cross-wired repeated pump usages and an unsupported design-count change. Each must fail its intended fact while unchanged expected facts remain true. Restoration regenerates all eight projections and passes all package gates; the unresolved policy still blocks acceptance.
