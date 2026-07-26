# SysML Engineering Workbench Recovery Acceptance Contract

Status: accepted recovery authority

Effective baseline: `80484f54610124bc3de1e25eb718d768dccff7db`

Incident record: `docs/revamp/36-failed-attempt-postmortem.md`

## Product strategy

Recover through a **VS Code-first authoring workbench** backed by the retained
transport-neutral Workbench Service, Protocol, Client SDK, command engine, and
assurance packages.

Do not rebuild a general-purpose IDE shell before differentiated SysML
engineering value exists.

GitHub Pages is a bounded recovery/evaluation surface. It is not a production
authoring profile until it independently passes the same exact-artifact and
practitioner gates. Tauri packaging remains deferred.

The first pilot is a bounded OMC4/SCADA-style interface-assurance slice.

## Non-negotiable invariants

1. SysML/KerML source is canonical.
2. Git is the preferred baseline/change authority when configured; a non-Git
   workspace remains valid with explicitly reduced baseline capabilities.
3. Official OMG specifications, release artifacts, libraries, and adopted issue
   resolutions define meaning. No third-party engine defines the language.
4. One language process is required for semantic authority in the recovery
   profile.
5. VinQut rebuilt against the pinned official Pilot is the recovery candidate
   for the required authority. Spec42 is optional, non-authoritative assistance
   and cannot be required for semantic open.
6. Every semantic mutation produces explicit, reviewable source edits.
7. Unknown or opaque source is preserved or the edit fails closed.
8. A diagram is a notation-defined projection, not generic graph rendering.
9. User-facing gates operate the exact delivered artifact.
10. Human usability cannot be inferred from service calls.
11. Every visual object and relationship retains stable identity and source
    provenance.
12. AI, packaging, hosting, and feature breadth remain frozen until the
    recovery vertical slice passes.

The existing hybrid runtime lock is historical evidence. It remains unchanged
until the single-required-runtime profile is rebuilt and requalified.

## Required evidence layers

Every gate records these layers separately:

| Layer | What it may prove |
|---|---|
| `unit-component` | pure functions, components, schemas, rendering primitives |
| `service-integration` | language process, workspace, command, query, assurance, report, transport behavior |
| `exact-artifact-ui` | the packaged extension/application, its assets, CSP, processes, workspace packaging, and user actions |
| `practitioner` | independent people completing defined tasks without developer intervention |

A gate remains open when any required layer is absent. Screenshots count only
when captured during the exact qualifying run and bound to its artifact hash.

## Recovery architecture

```text
Official SysML/KerML release + libraries + issue resolutions
                            |
                    one required authority
                     VinQut/Pilot candidate
                            |
        product-owned semantic evidence and identity
                 /                         \
       VS Code source/editor          notation projections
      diagnostics/navigation       InterconnectionProjection
                 \                         /
               typed command proposal/review
                            |
                    Workbench Service
   workspace | query | rules | source patch | transaction | evidence
                            |
            optional Git capability and baseline services
```

The VS Code extension is a client/host. It must not contain a second semantic
implementation. It should use native Explorer, editor, Search, Problems, SCM,
diff, settings, commands, and workspace trust rather than recreating them in a
webview.

## Recovery Gate R0 — Honest reset and safety floor

Deliver:

- P4 and P5 product gates marked invalidated;
- P6 described as retained service-level safety evidence only;
- P7/release progression blocked;
- README and active entry points labelled recovery pre-alpha;
- Pages source authoring disabled until exact-artifact qualification;
- the element-card surface labelled an element map, not SysML notation;
- generic graphical editing removed from product claims;
- Interfaces and Verification remain available without Git;
- service qualifiers renamed and prevented from claiming usability;
- companion dirty provenance and official-library tree verification repaired;
- this contract and an executable Codex handoff committed.

Pass evidence:

- active documentation contains no P4/P5 product-pass claim;
- a non-Git workspace can render interface and verification assurance;
- baseline controls are disabled with a capability message;
- a dirty portable input cannot produce a clean qualifying companion;
- library bytes cannot change without failing the tree-hash check;
- exact branch checks pass.

R0 does not qualify a product release.

## Recovery Gate R1 — Practitioner benchmark and reference truth

Freeze a multi-file pilot containing:

- one system boundary and two organizational parties;
- remote station, communications path, and control centre;
- part definitions and usages;
- boundary ports;
- one primary connection/interface and one backup path;
- item flows with direction and exchanged type;
- one stakeholder/system requirement chain;
- one verification case;
- one operating mode;
- deliberate incomplete typing, ownership, traceability, and verification;
- an unresolved reference;
- an optional Git-backed copy with two baselines;
- an equivalent non-Git copy.

Create versioned reference answers for:

- containment/type hierarchy;
- expected Interconnection View objects and relationships;
- source ranges and stable identities;
- interface-register fields and explicit unavailable states;
- deterministic findings;
- exact expected source changes for create-port, connect-ports, and
  create/change-flow operations.

Pass evidence:

- a SysML practitioner accepts the answers;
- notation rules trace to exact official release material;
- the runtime qualification and all downstream gates use the same pilot;
- scope changes require an owner disposition.

## Recovery Gate R2 — Text authoring in the delivered extension

Required:

- normal folder/workspace opening;
- immediate visible source through the native VS Code editor;
- multi-file Explorer and Search;
- standard-library resolution;
- diagnostics and Problems;
- completion and hover;
- definition and references;
- rename proposal with source preview;
- source/model identity navigation;
- capability reporting;
- deterministic restart;
- required semantic open with Spec42 absent.

Pass evidence from the packaged VSIX in a clean profile:

- source is visible within two seconds after workspace readiness;
- no extension-host or webview unhandled error occurs;
- cross-file definition/reference tasks pass;
- an edit updates diagnostics and the semantic snapshot;
- restart reproduces the workspace without browser-only state;
- the official bounded fixture profile passes;
- loss of optional assistance does not close the workspace.

## Recovery Gate R3 — Read-only Interconnection View

Create a product-owned `InterconnectionProjection` between the normalized
semantic layer and renderer.

The projection and rendered view must show:

- owning usage/definition as frame;
- nested part usages;
- ports on owning boundaries;
- owned versus inherited status;
- type and multiplicity when available;
- connections and interfaces with explicit ends;
- item flows with direction and exchanged item/type;
- compartments;
- unresolved endpoints and unsupported facts;
- stable identity and source reference for every visual object;
- deterministic default layout and saved user positions;
- selection, inspection, and source reveal;
- pan, zoom, fit, keyboard selection, and a tabular alternative.

Pass evidence:

- every expected pilot port, connector, interface, and flow appears exactly once;
- no required relationship is represented only as a count;
- no UI string parsing creates semantic facts;
- an engineer can answer what crosses the boundary, between which endpoints,
  in which direction, and with what modeled type;
- saved layout survives restart;
- a practitioner approves notation meaning and interaction.

## Recovery Gate R4 — Source-preserving graphical edits

Implement only:

1. create a port on an eligible owner;
2. connect two eligible ports;
3. create or change an item flow.

Each operation must:

- start from diagram interaction;
- restrict choices by source-backed semantic eligibility;
- produce a typed command;
- preview readable source edits;
- validate with the required language authority;
- preview diagnostics and semantic changes;
- require explicit user approval;
- update source, projection, explorer, and diagnostics;
- support byte-exact or semantically equivalent undo as defined by the command
  profile;
- fail closed near opaque or unsupported source.

Pass evidence:

- all three operations run through the packaged extension on the pilot;
- source remains unchanged before approval;
- malformed, stale, conflicting, or unsafe operations are rejected;
- restart reproduces the approved model and layout;
- undo restores the accepted baseline.

## Recovery Gate R5 — Interface assurance

The first profile requires these fields:

- stable identity;
- owner and modeled boundary;
- source and target endpoints;
- direction;
- exchanged item/service or explicit absence;
- type and units when modeled;
- linked requirements and verification;
- assumptions, status, findings, and source citations.

Additional fields use one of four explicit states:

- `modeled`;
- `not-modeled`;
- `unsupported-by-profile`;
- `not-applicable`.

Protocol, rate/capacity, timing, operating modes, failure, safety, and security
fields become blocking only after their semantic extraction is included in the
supported profile.

Pass evidence:

- seeded gaps are found with stable citations;
- unavailable facts are never invented;
- one defect is corrected through R4;
- the interface register and quality report reproduce after clean restart;
- provenance identifies source state, language release, runtime, projection,
  query, rules, and workbench versions;
- non-Git provenance states that commit/baseline evidence is unavailable.

## Recovery Gate R6 — Independent practitioner pilot

At least three practitioners independently complete:

1. open the pilot workspace;
2. locate an unresolved reference;
3. navigate requirement to design;
4. identify an unverified requirement;
5. inspect the interconnection;
6. add a port, connection, and flow;
7. review and approve the source patch;
8. undo one accepted change and restore it;
9. restart and confirm the model/layout;
10. export the interface register.

Pass evidence:

- every participant completes every task without developer intervention;
- task time, errors, confusion, recovery, and abandonment are recorded;
- material failure points are repaired;
- the complete pilot is rerun against the repaired exact artifact;
- tested commit, VSIX/application hash, runtime hashes, OS, and VS Code/browser
  versions are recorded.

## Deferred until R6 passes

- broader diagram profiles;
- semantic-baseline product UI beyond the pilot;
- expanded model-anchored review workflow;
- report-catalog expansion;
- AI assistance and provider adapters;
- GitHub Pages production authoring;
- Tauri packaging, signing, notarization, and installers;
- Windows and managed-hosted claims;
- production or release-candidate product language.

## Stop-the-line conditions

Any condition below freezes progression:

- source does not initialize;
- a primary workflow emits an unhandled error;
- exact-artifact evidence bypasses the UI;
- a required visual relationship is missing or invented;
- a non-Git workspace loses a non-Git capability;
- a mutation writes before approval;
- opaque source is altered;
- saved layout fails after restart;
- the artifact, runtime, or evidence hash is absent;
- required practitioner evidence is missing.
