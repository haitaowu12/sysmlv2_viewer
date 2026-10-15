# Parcel sorter fictional authoring exercise

This model follows the frozen author-independent `../parcel-sorter-inputs/` brief, PS-ICD R1 and D1 dialogue. It is a static study, not a real participant trial, blind real-user benchmark, physical-performance result or commissioning package.

The first candidate was recorded and hashed before `evaluation.json` was read. A line-bounded dialogue read inadvertently included clarification C1/C2 before recording the acknowledgement question; that deviation is retained in the external execution receipt. Strict clarification-blind first-pass authoring is therefore not claimed.

`model.sysml` contains five unallocated responsibility definitions, selected physical composition, two separately owned actuator usages typed by one RotaryActuator definition, explicit four-message exchanges, an intended jam/recovery story with authorisation trigger and clearance guard, two requirements and one planned verification artifact. `homeAngle` source units are degrees; unary minus remains an engine expression, not a claimed evaluated analysis. Position feedback payload/timing, event routing, protection, calibration and executable recovery mechanisms remain unspecified.

`evidence.json` records copied source byte identities, exact quotations, model targets and separate interpretations. `intake.json` records those sources. This is a trace ledger, not a passed declaration-coverage/entailment assessment. `decisions.json` retains the blocking ACK-MEANING-01 disagreement and other exclusions. Neither acknowledgement interpretation is adopted. `expected-facts.json` tests independent engine facts; it does not establish physical correctness or acceptance.

Fresh execution evidence stays outside this package. Qualify model/views through `scripts/sysml.py qualify` into a new output directory. Then set `SYSML_PARCEL_REPORT` to the fresh managed report and run `python3 -m unittest test_parcel_sorter -v` from `workbench/tools/reference-pilot/`. The six report-based tests skip when that evidence is absent. They check live facts, signed default AST, payload/direction, guard/trigger, source/revision identity and occurrence parity.

Human catalogue key `ParcelSortingStudy::sorter/diverterB/actuator` and source selector `ParcelSortingStudy::sorter::diverterB::actuator` resolve the same selected source element. Its tag is QA-DB-02 and default is minus eight degrees; sibling A has QA-DA-01 and twelve degrees. Context aliases reference this equipment and do not introduce additional physical assets.

R2 and lifecycle change handling are a separate exercise. A timing-source update does not authorise an actuator remedy, rewrite a historical observation or establish commissioning readiness.

Run the connected fictional ICD revision exercise from any directory:

```sh
python3 /path/to/sysml-v2-modeling/workbench/fixtures/authoring/parcel-sorter/run_change.py --output /evidence/new-sorter-cycle
```

The script uses the sibling frozen inputs and package launcher. It qualifies baseline and candidate, changes only the source-backed timing provision from 120 to 80 ms, checks unaffected facts, records witnessed impact and a fictional local disposition, and promotes a disposable baseline only inside the new output directory. The installed model stays unchanged. Historical mock evidence remains on R1 with its 95 ms value and original reported result. Acknowledgement meaning, timing compliance and commissioning readiness remain unresolved. A real project must supply its own controlled evidence and disposition authority.
