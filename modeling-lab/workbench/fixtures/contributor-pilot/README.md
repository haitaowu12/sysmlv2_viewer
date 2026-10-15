# Typed contributor pilot fixture

This fixture is a generic, fictional infrastructure-control exercise for the roadmap's B03 pilot contract. It tests a typed requirements/interface contribution path around one canonical SysML source model. It is independent from the parcel-sorter and pump-station domain examples and does not claim real participant acceptance.

## Source and revisions

- `model.sysml` is controlled baseline **A**. It declares a `ScalarValues::Real` response limit of `120`; the `ms` unit is carried by the contributor manifest and source documentation.
- `candidate-model.sysml` is candidate baseline **B**. Its only intended engineering change is `120 -> 80` in the response provision and requirement documentation.
- Both revisions preserve the historical `95 ms` observation at `FIELD-A`, the typed request/acknowledgement exchange, the planned verification definition, the unresolved `ACK-MEANING-01` question, and the unrelated `UnrelatedAdvancedLifecycle` state/comment.
- `inputs/interface-register-a.csv` and `inputs/interface-register-b.csv` provide the source rows used by the reader and contributor tasks. They are fictional test data.

The historical observation is not a current requirement result. The acknowledgement question distinguishes an accepted dispatch message from a completed field action; neither interpretation is selected. The planned verification is not an executed check.

## Contributor surface

`contributor.json` is the proposed manifest for a future local workspace. It has typed requirement and interface rows, a decimal field, one editable requirement documentation field, a read-only qualified reference field, a millisecond unit constraint, the historical evidence record, and the unresolved issue. The reference choices must resolve to one of the declared qualified field occurrences. Reference mutation is deferred in this packet; an implementation must not invent a second model or silently fall back to a label match.

`cases/candidate-proposal.json` records the exact intended token changes. The future command path should check the exact source base, create a candidate through the existing candidate boundary, qualify the candidate with the locked engine, and leave the canonical baseline unchanged until the owning process accepts it.

## Negative and recovery cases

- `cases/invalid-unit.json` rejects a seconds-labelled value for the millisecond scalar before apply.
- `cases/invalid-reference.json` rejects an unknown `fieldC` identity before apply.
- `cases/stale-base.json` rejects a transaction prepared against A when the workspace is already at B, with no partial token edits.
- `cases/undo-reopen.json` freezes the expected baseline/candidate, undo and reopen outcomes.

`expected-facts.json` is independently authored from the pilot inputs. `acceptance-contract.json` binds reader, contributor, reviewer and model-steward tasks to those facts and explicitly records the limits of the fixture. A contract check or fresh qualification would establish agreement with these declared facts only; it would not establish human usability, project approval, physical timing, verification execution, commissioning readiness or general SysML conformance.

### Fact-check route and erratum

The requirement declaration in both qualified reports is a `RequirementUsage`, not a `RequirementDefinition`; `expected-facts.json` records that corrected engine classification. The requirement's `subjectParameter` is a usage named `ContributorPilot::responseWithinBound::controller`; its resolved engine type is `ContributorPilot::ControlController`. The expected-facts key is therefore `subjectType`, and the checker resolves the subject usage before comparing its type chain. It must not compare the usage qualified name as if it were the subject type. The verification declaration resolves to `VerificationCaseDefinition` in the pinned engine. The contributor checker now requires that exact classification, the resolved `responseWithinBound` target and directly owned planned-only documentation in both reports. An earlier 24-check pass omitted those facts and is superseded by the 28-check result. The corrections change no engineering intent. JSON parsing checks only file structure and must not be reported as a semantic pass.

To execute the facts, qualify `model.sysml` and `candidate-model.sysml` separately with the locked `scripts/sysml.py qualify` route, then map each `models.baselineA` or `models.candidateB` fact into the schema-1 `checks` object accepted by `workbench/tools/reference-pilot/check_contract.py`. The minimum executable mappings are: select `ContributorPilot::ControlController::responseLimitMs` and expect literal `120` or `80`; select `ContributorPilot::ControlController::historicalObservedResponseMillisecondsAtA` and expect literal `95`; select `ContributorPilot::responseWithinBound` and expect metaclass `RequirementUsage`, resolve its subject usage `controller`, compare its resolved type to `subjectType: ContributorPilot::ControlController`, and check source clauses for the relevant provision and `ACK-MEANING-01`; select `ContributorPilot::UnrelatedAdvancedLifecycle` and expect metaclass `StateDefinition`. Check the directed request/acknowledgement flows separately against the fresh report's `interconnection()` projection. Run the invalid-unit, invalid-reference, stale-base and undo/reopen cases at the contributor command boundary; `check_contract.py` cannot establish those transactional outcomes. No semantic or workflow pass is claimed until those fresh checks are run.

The canonical model intentionally uses constructs already exercised by the standalone skill: typed items, ports, a directed interface exchange, part definitions/usages, connections, attributes, a state definition, a requirement and a planned verification definition. No malformed source is included; invalid units/references are contributor-input cases so a runtime can report them as typed rejection behavior.
