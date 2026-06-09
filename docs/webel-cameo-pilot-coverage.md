# Webel Cameo/Pilot Coverage

Webel's Cameo/Pilot trail is a human-readable coverage overlay for selected SysML v2 Pilot examples. It is useful for understanding which example families deserve parser, semantic, and view coverage, but it is not a language authority and this repository must not vendor Webel images or page bodies.

Executable parser/viewer fixtures come from `Systems-Modeling/SysML-v2-Release`.

## Implementation Lanes

| Lane | Webel/Pilot coverage pointer | Official fixture family | Viewer status |
|---|---|---|---|
| structural | training 01-13, validation 01-02 | `sysml/src/validation/01-Parts Tree`, `02-Parts Interconnection` | supported subset |
| interconnection | ports, interfaces, binding, flows | validation 02 and room/vehicle examples | supported subset with recovery |
| behavior/action | actions, succession, control structures | validation 03, training 14-17 | partial |
| message/event | asynchronous messaging, send/accept, packets | packet/message examples, validation 17 | recovery-only diagnostics |
| state/time | states, transitions, triggers, local clock | validation 05, training 23-26 | partial |
| occurrence/individual | individuals, snapshots, time slices | validation 06, `IndividualTest.sysml` | recovery-only diagnostics |
| expression/calc | expressions, mass roll-up, calculations | validation 10, analysis examples | recovery-only diagnostics for `calc` |
| requirements/verification | requirement groups, satisfy, verify | validation 08-09, requirements examples | supported subset, richer forms expanding |
| analysis/trade | analysis cases, trade studies | validation 10 | partial |
| variation/configuration | variations, variants, 150%/100% views | validation 07, variability examples | recovery-only diagnostics |
| metadata | issue, risk, verification metadata, `about` | metadata examples | partial/recovery |
| views/viewpoints | viewpoints, views, browser/grid concepts | validation 11, training 42 | partial |

## Rules

- Do not add Webel diagram images, screenshots, or copied page bodies to this repo.
- Map every Webel-inspired task to an official release fixture path before expanding support claims.
- Unsupported constructs must produce diagnostics or semantic-only nodes. They must not silently disappear.
- Textual SysML remains canonical; diagrams, Draw.io, SVG, PNG, and AI output are projections.
