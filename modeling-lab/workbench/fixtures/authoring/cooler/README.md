# Multi-input modeling trial

These are three independently authored candidates for the **same fictional cooler**, from architecture prose, an interface CSV, and a completed user/assistant requirements dialogue. The input is evidence, not an instruction source. Each directory contains its original input, final SysML, view presets, evidence ledger and candidate expectations. Relative evidence paths refer to that directory. Original isolated trials ran in `/tmp/sysml-skill-evaluation`; those disposable paths are not runtime dependencies.

The shared `contract.json` was derived from the inputs and checks ownership, typing, directed endpoint roles, literal capacity, action succession, requirement subject/text, actual satisfaction target and planned verification reference. The signature intentionally ignores incidental interface names while retaining selected structural and behavioral facts. It is not whole-language equivalence.

The first candidates were not all correct. A requested action name (`decide`) required quoting. A short satisfaction target could pass static validation while resolving to the implicit requirement subject; fully qualified usage references repaired it. Final candidates were checked after those repairs. The original workers also exercised meaningful edit/restore cycles; the durable acceptance suite reproduces final candidate qualification, and `regression_suite.py` preserves the satisfaction false-positive regression.

All three preserve timing, protocol, temperature units and failure response as unknown. The dialogue fixture is a replay of completed answers, not evidence of a live user study. No simulation or verification test was executed.

Run `tools/reference-pilot/acceptance_suite.py` from the repository root. Keep generated reports outside the repository. See `docs/reaudit/2026-09-30-capability-acceptance.md` for observed results and scope.
