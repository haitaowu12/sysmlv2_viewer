# Units, references and interface agreements

This increment extends the existing source-backed contributor workflow. It
uses the same exact-base proposal, semantic validation, explicit approval,
atomic apply and inverse edit. It introduces no parallel model store.

## Editing profile

| Task | Supported behavior | Boundary |
|---|---|---|
| Quantities | Existing simple `ISQ::DurationValue`, `ISQ::LengthValue` and `ISQ::MassValue` attributes; s/ms, m/mm, kg/g choices | Values are entered explicitly; selecting a unit never silently converts magnitude. Composite/offset units, equations, type aliases and unsupported source shapes remain read-only |
| References | Pick an existing concrete same-scope part, port or item with the same single semantic type as a simple `ref` declaration | No arbitrary source entry, reference chains, self-reference, dynamic initializer, implicit subtype or cross-scope compatibility inference |
| Interface agreement | Change compatible same-scope endpoints, preserve port type and conjugation, and edit existing status/owner/rationale fields | Status is a recorded disposition, not authenticated stakeholder approval. No new agreement schema, ownership inference, arbitrary connector syntax or physical verification claim |

The supported agreement profile has existing `agreementStatus`,
`agreementOwner` and `agreementRationale` source attributes. Status options are
draft, proposed, agreed and rejected; owner and rationale are required for a
non-draft disposition. The source review exposes every proposed change before
apply. Historical observations and unrelated content remain intact.

Unit choices map to expressions in the pinned official library. In particular,
milliseconds use `SI::milli * SI::s`, not a nonexistent `SI::ms` shortcut.
The editor rejects a quantity when local `ISQ` or `SI` declarations shadow the
supported standard names. This is a deliberately bounded profile, not a new
units solver. The full candidate is still validated by the locked engine.

The numeric command boundary uses JavaScript numbers. Decimal input that
would round or underflow when serialized is rejected before staging; the
source-backed reader also refuses an unsupported lossy literal. Engineering
before/after summaries must agree with the actual proposed values. Unchanged
source spelling and delimiter whitespace are preserved.

## Reproducible workflow check

The fictional [fixture](../fixtures/workspaces/contributor-phase2/README.md)
changes a 120 ms provision to an explicitly entered 0.08 s, selects field B,
and proposes a compatible receiver-B agreement. Two additional quantity edits
exercise length and mass units. Historical 95 ms evidence and open
acknowledgement meaning remain unchanged. The expected candidate is frozen
outside the workspace, independently of the editor's output.

```sh
python3 "$CANDIDATE/run-candidate.py" npm run qualify:contributor:phase2 -- \
  --runtime-lock "$CANDIDATE/candidate-runtime-lock.json" \
  --candidate-manifest "$CANDIDATE/candidate-manifest.json" \
  --output /absolute/output/contributor-phase2.json --keep-workspace
```

The runner checks malformed/wrong-dimension values, incompatible or missing
references, wrong port type/conjugation, missing agreement ownership, invalid
mixed batches and an engine-rejected unknown type. It checks no write before
approval, exact expected source after one five-field batch, engine-resolved
reference/endpoint targets, identities, stale apply, historical/unrelated
content, byte-exact undo and clean reopen. The receipt binds the candidate
lock/manifest and implementation revision and reports dirty state explicitly.

## Offline use

Use the [local installation candidate](runtime-candidate-installation.md) and
`--sample-profile contributor-phase2`. Open the printed companion URL, choose
**Requirements**, then **Properties**, **References** or **Interfaces**. For an
interface, choose **Interface agreement** in the editor. Stage the fields, read
the engineering summary, generate the validated proposal, then approve/apply.

Monaco and its editor worker are bundled locally for the Source surface. The
legacy `?legacy=1` Draw.io bridge still uses an external service; it is outside
the supported offline companion route. The paired workbench's native diagram,
contributor and source surfaces use local assets.

The [runtime regression gates](runtime-candidate-gates.md) and isolated
installation checks establish their stated candidate scopes. The user reported
that no separate clean Mac or macOS VM was available on 2026-10-13. First-run
Gatekeeper/quarantine behavior on another machine therefore remains untested,
along with signing/notarization, Windows, human acceptance and model-scale
qualification. The production runtime defaults remain unchanged.
