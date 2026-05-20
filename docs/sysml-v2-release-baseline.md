# SysML v2 Release Baseline

## Current Anchor

Use this repository as the project baseline for SysML v2 source examples and parser/viewer fixture work:

- Repository: `https://github.com/Systems-Modeling/SysML-v2-Release`
- Branch: `master`
- Tag: `2026-04`
- Commit: `9baca5908ca28b53da085de69336fde48420ea8f`
- Commit date: `2026-05-14`

`HEAD`, `master`, and tag `2026-04` were verified to resolve to the same commit during the 2026-05-20 refresh.

## Source Use Rules

- Treat textual SysML source as canonical.
- Use release `bnf/` before extending parser syntax.
- Use release `sysml/src/validation/` and `sysml/src/examples/` as regression fixtures.
- Treat `sysml.library.xmi*` as implementation/interchange fixtures, not normative OMG XMI.
- Keep generated examples inside the viewer within the supported parser subset unless explicitly testing unsupported syntax recovery.

## Supported Viewer Subset

Roundtrip support is strongest for:

- `package`
- `part def`, `part`
- `port def`, `port`
- `connection def`, `connect`
- `interface def`, `interface`
- `action def`, `action`
- `state def`, `state`, `transition`
- `requirement def`, `requirement`
- `constraint def`, `require constraint`, `assume constraint`
- `attribute def`, `attribute`, `item def`, `item`
- `verification def`, `verify`
- `analysis def`, `analysis`
- `viewpoint def`, `view def`
- `metadata def`, `allocation`, `dependency`, `satisfy`

Partial or recovery-only areas:

- `alias`
- `calc`
- `individual`
- `occurrence`
- `variation` / `variant`
- rich metadata usage with `about`
- broader `satisfy requirement ... by ...` and `verify requirement ...` forms
- full graphical BNF coverage

## Fixture Gate

When the release repo is available locally, run:

```bash
SYSML_V2_RELEASE_DIR=/path/to/SysML-v2-Release npm run test:release
```

Core fixture set:

- `sysml/src/validation/01-Parts Tree/1a-Parts Tree.sysml`
- `sysml/src/validation/02-Parts Interconnection/2a-Parts Interconnection.sysml`
- `sysml/src/validation/03-Function-based Behavior/3a-Function-based Behavior-1.sysml`
- `sysml/src/validation/05-State-based Behavior/5-State-based Behavior-1a.sysml`
- `sysml/src/validation/06-Individual and Snapshots/6-Individual and Snapshots.sysml`
- `sysml/src/validation/07-Variant Configuration/7b-Variant Configurations.sysml`
- `sysml/src/validation/08-Requirements/8-Requirements.sysml`
- `sysml/src/validation/09-Verification/9-Verification-simplified.sysml`
- `sysml/src/validation/10-Analysis and Trades/10c-Fuel Economy Analysis.sysml`
- `sysml/src/validation/11-View and Viewpoint/11a-View-Viewpoint.sysml`
- `sysml/src/examples/Vehicle Example/SysML v2 Spec Annex A SimpleVehicleModel.sysml`
- `sysml/src/examples/Simple Tests/IndividualTest.sysml`
