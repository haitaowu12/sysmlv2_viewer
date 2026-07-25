# Semantic and Attribute Model Review

This is a product exposure plan, not a replacement metamodel. Formal meaning comes from the [OMG SysML 2.0](https://www.omg.org/spec/SysML/) and KerML specifications and the exact official release. “Required attributes” below means the minimum normalized facts needed by workbench workflows; omission from a view never changes model semantics.

Phase key: P1 engine qualification/service; P2 normalized semantics/identity/query; P3 commands; P4 projections/UX; P5 assurance.

| Construct | Official semantic basis | Required normalized attributes | Useful user properties | Graphical representation | Tabular representation | Common workflows | Deterministic validation | Complexity | Target |
|---|---|---|---|---|---|---|---|---|---|
| definitions/usages | SysML definition/usage and KerML type/feature distinctions | id, kind, name, qualified name, owner, declared/effective type, source span | documentation, lifecycle status, tags | distinct definition/usage marks, compartments | kind/type/owner register | reusable type creation, instantiate/use, find usages | usage typing, allowed specialization, unresolved type | H | P1–P3 |
| ownership/membership | KerML namespace, membership, owning membership | owner, membership kind, visibility, member id/order | origin, inherited/owned badge | containment tree/nesting | owner/member/visibility | decompose, move, package structure | single ownership, visibility, cycle/safe move | H | P1–P3 |
| typing | KerML feature typing; SysML usage constraints | declared types, effective types, source refs | type docs, compatibility | typing edge/compartment label | usage→type | retype, inspect compatibility | target kind, ambiguity, compatibility | H | P1–P3 |
| specialization | KerML specialization | general/specific, specialization kind, inherited members | hierarchy path | hierarchy edge/tree | subtype table | build reusable taxonomies | cycles, disjointness/constraints per profile | H | P1–P2 |
| redefinition | KerML redefinition | redefining/redefined ids, effective feature | origin and override delta | compartment override marker | feature/origin/effective | specialize and override | compatible owner/type/multiplicity | H | P1–P3 |
| subsetting | KerML subsetting | subset/superset ids, effective bounds | subset chain | labeled relation | subset matrix | constrain collections/roles | compatible type/multiplicity/feature | H | P1–P3 |
| multiplicity | KerML multiplicity | lower/upper expressions, ordered/unique, source | evaluated range, uncertainty | end/feature label | bounds columns | cardinality design, interface capacity | valid bounds/evaluation, redefinition compatibility | M/H | P1–P3 |
| values | KerML expressions/feature values; SysML attributes | expression syntax, evaluated/unevaluated value, unit/type, binding/default/initial semantics | display precision, tolerance, provenance | value compartment/constraint callout | value/unit/source | parameterize, compare, verify | type/unit/dimension, evaluation status | H | P2–P5 |
| feature chains | KerML feature chaining | ordered feature path, resolved segments, source | readable path, root/context | path/edge label | chain segments/resolution | navigate nested properties, bind endpoints | each segment resolvable and context-valid | H | P1–P2 |
| ports | SysML port definitions/usages | type, owner/boundary, direction/features, multiplicity | protocol, medium, status, external flag | port on boundary | interface endpoint register | define boundary/endpoints | typed endpoint, direction, owner, exposed features | H | P1–P5 |
| interfaces | SysML interface definitions/usages | ends/roles, exchanges, constraints, owners | ICD id, authority, version, safety/security class | interface/contract node | interface register | interface control and assurance | roles/end types, direction, exchange completeness | H | P1–P5 |
| connections | SysML connection definitions/usages/connectors | ends, roles, type, owner/context | connector/physical medium, status | connection edge | endpoint pair register | wire architecture, impact review | resolvable compatible ends, context, type | H | P1–P5 |
| item flows | SysML item flow/end semantics | source, target, item/type, direction | units, rate/capacity, timing, mode | directed exchange overlay | flow register | data/energy/material/service exchange | direction, item type, unit/rate consistency | H | P1–P5 |
| actions | SysML action definitions/usages and successions | parameters, inputs/outputs, owner, succession/control/data relations | responsibility, duration, mode | action-flow reference notation | action/input/output/owner | behavior decomposition/allocation | parameter and flow compatibility, reachability rules | H | P1/P4 |
| states | SysML state definitions/usages | states, entry/do/exit, owning behavior, substate relations | mode category, allowed configuration | state hierarchy/transition view | state table | mode/state modeling | initial/final/composite rules per profile | H | P1/P4 |
| transitions | SysML transition usages | source, target, trigger, guard, effect | priority, timing, rationale | transition arrow with labels | transition table | define response/mode changes | endpoints, trigger/guard/effect resolution | H | P1/P4 |
| events/messages | KerML/SysML occurrences, events, message/action semantics | sender/receiver, payload/type, trigger context, time/order | protocol event id, reliability | sequence/transition annotations | message/event register | interaction and protocol assurance | endpoint/payload/type/order rules in profile | H | P1/P4–P5 |
| requirements | SysML requirement definitions/usages | id, name, text/doc, subject, parameters, owner, hierarchy | rationale, source, priority, risk, status | requirement node/relationship | requirement register/hierarchy | derive, allocate responsibility, approve | missing text/owner/subject; duplicate/conflict candidates | H | P1–P5 |
| concerns/viewpoints | SysML concern/viewpoint/view semantics | concern, stakeholder, viewpoint method, view exposure/satisfaction | decision question, audience, acceptance | view frame/legend | concern→view coverage | stakeholder communication and review scope | missing stakeholder/concern/method; stale view | H | P2/P4–P5 |
| analysis cases | SysML case/analysis semantics | subject, objective, parameters, result bindings, method | analyst, tool/version, assumptions | analysis context | analysis register | trade/performance analysis | inputs/outputs/method/provenance completeness | H | P2/P5 |
| verification cases | SysML verification case semantics | subject, verified requirement, objective, method/steps, result/evidence links | owner, status, environment, acceptance criteria | verification context/trace | readiness/coverage matrix | plan/execute/evidence/close | missing method/owner/evidence/trace; stale result | H | P1/P5 |
| allocations | SysML allocation definitions/usages | allocated/allocating ends, kind, context | rationale, responsibility, status | allocation edge/swimlane | allocation matrix | function→structure/responsibility assignment | valid end kinds, duplicates/gaps | M/H | P2/P4–P5 |
| metadata | KerML metadata definitions/usages/annotations | metadata type, annotated element, features, source span | profile label, governance fields | badge/compartment when configured | metadata register | project tailoring, rule inputs | definition/target applicability, preserved unknown fields | H | P1–P3 |
| variants/configurations | SysML variation/variant and configuration constructs at supported release | variation point, alternatives, selection, constraints, resolved config | applicability, decision/rationale, baseline | variability overlay/config tree | option/config matrix | product-line/configuration review | selection completeness, mutual constraints, unresolved alternatives | VH | experimental after P2; production phase by qualified profile |
| imports/aliases | KerML import/membership/alias semantics | import kind, namespace/member, alias, visibility, recursive flag, source | used/unused, resolved origin | dependency tree | import/alias table | modularize, resolve dependencies | ambiguity, visibility, cycles, unresolved imports | H | P1 |
| library elements | official library packages/KPAR/API artifacts | release, package, qualified id, content hash, provenance, read-only state | documentation, deprecation, source release | distinct read-only styling | library inventory | type/unit reuse, release upgrade | hash/release compatibility, shadowing | H | P1 |
| documentation | KerML/SysML documentation/comment elements and source comments | owner/target, body, locale/format where defined, source span | rendered markdown policy, authoring status | compartment/callout | documentation coverage | explain model, report, review | safe rendering, preservation, required-doc rules | M | P1–P5 |
| provenance | official API identity/version plus workbench artifact provenance | source URI/span/hash, commit, release, engine/adapter, derivation, aliases | author/reviewer/change reason | analytical provenance badge | audit/provenance table | evidence, compare, reproduce, cite | resolvable immutable refs, hash/version completeness | H | P1–P5 |

## Schema-aware property panel

The panel displays four layers separately:

1. **declared** in source;
2. **inherited/redefined/subsetted** with origin;
3. **derived/evaluated** with rule/engine provenance and uncertainty;
4. **workbench artifacts** such as review, Git, diagnostics, and evidence, clearly outside model semantics.

Editable fields are generated from a product-owned command schema, not from engine AST reflection. Every edit previews source ranges, preserves comments/unknown syntax, and fails closed if the adapter cannot prove safety.

## Interface assurance extension

The normalized interface projection adds non-normative engineering fields only through modeled metadata/profile definitions or versioned review/view artifacts:

- owning parties and boundary;
- exchange kind, direction, type, units, rate/capacity, timing;
- protocol/physical connector;
- operating modes and failure behavior;
- safety/security attributes;
- requirement/verification basis;
- status, assumptions, findings, and change history.

The UI states whether each field is model-declared, inherited/derived, configured metadata, or review artifact. It never stores these facts only in component state.

## Rule provenance

Every rule declares semantic inputs, capability-profile prerequisites, severity, deterministic algorithm/version, exclusions, and source/reference. A rule returns `not-evaluated` rather than “pass” when required semantics are unavailable.
