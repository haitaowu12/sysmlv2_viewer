# Checked syntax and evidence discipline

Use this reference when a community example or remembered restriction conflicts with the intended model. The language authority is OMG SysML 2.0 Language [formal/26-03-02](https://www.omg.org/spec/SysML/2.0/Language/PDF), especially §§8.2.2.6–8.2.2.8 and 8.2.2.11. The small controls below passed the installed, hash-pinned official Pilot 0.52.0 on 2026-10-02. They do not establish vendor interoperability or full conformance.

```sysml
package CheckedSyntax {
    private import ScalarValues::*;
    part def Pump;
    attribute def Reading;
    enum def OperatingMode { idle; running; failed; }
    attribute mode : OperatingMode = OperatingMode::idle;
    attribute count : Integer = 3;
    part pumps : Pump[count];
}
```

- Empty part definitions are legal. Give them useful content when the system definition requires it, not to satisfy an invented grammar rule.
- An attribute definition need not explicitly specialize a scalar. Choose scalar types, units or structured attributes to match the domain; do not flatten everything into String.
- Enumerations are supported; members above use semicolons. A comma-separated list is a different, invalid syntax. Substituting String loses the enum's value domain.
- A multiplicity bound may be a feature reference. This does not permit arbitrary bracket expressions, prove an evaluated count, or justify inventing cardinality when the source is silent.
- Import visibility is required by the textual grammar (SysML §§7.5.3 and 8.2.2.5): use the intended `private`, `protected` or `public` prefix. The missing-prefix negative control fails the pinned engine. Explicit application-level types remain a modeling decision; distinguish that decision from grammar requirements.

Reproducible product fixtures live at `workbench/fixtures/language/community-review/`; run `workbench/tools/reference-pilot/community_regressions.py`. The tests inspect resolved metaclasses and the multiplicity bound referent, not just a green parser. They also reject the malformed enum.

## Evidence before acceptance

The bundled `workbench/tools/reference-pilot/EVIDENCE_CONTRACT.md` defines a machine-checked companion to the narrative evidence ledger. Read it when creating or updating `evidence-contract.json`. It requires an independently reviewed `intake.json` source catalog, and binds source bytes, exact quotes/line anchors, model revision and explicit declaration targets. Freeze intake before generation; do not rewrite it automatically to agree with a candidate. A `user-confirmed` classification is not an approval record. The bounded profile requires individual source-defined usages and relationships; citing their parent does not cover new children. Exclusions are reported. Anonymous reference fragments, memberships, typing/redefinition edges, expressions and implicit/library elements are outside that profile and need their own semantic checks where relevant. The current schema supports a single source model, not source-set evidence coverage.

A passing citation check does not establish entailment. Inspect whether each quotation supports the interpretation and whether unknowns/conflicts have been preserved. Keep expected semantic facts independent of candidate generation. On an edit, compare the model and source deltas, review affected claims, then update revision-bound evidence; never regenerate accepted claims automatically from the candidate to make the checks pass.

Query the current model report when answering model questions. State its source hash and qualification limits as needed; do not reuse prior-turn names or relationships without checking the current revision. A no-result query may mean the query/profile omits the feature; inspect scope before claiming the system lacks it.

## Community comparison provenance

Reviewed 2026-10-02: [DeciSym/sysmlv2-skill](https://github.com/DeciSym/sysmlv2-skill/tree/bcfbd0cc35eb7b723f09995ce9f27bd62d4c236e), ISC, and [joescohen/sysml-bridge](https://github.com/joescohen/sysml-bridge/tree/a4b3f44e2031aadd2940033a4b7b71a4663ec39b), MIT. We independently implemented citation/coverage checks and strengthened current-model querying and change-review guidance; no donor code, skill runtime or approval policy was imported. Several DeciSym syntax restrictions contradicted the checked examples; bridge's provenance rule reproduced missing-usage coverage. Its broader corpus pipeline was not reproduced. This is a source comparison with bounded controls, not a statistical superiority claim. Historical review transport is not a runtime dependency.


## Pro review corrections — 2026-10-03

The approved snapshot was independently reviewed using ChatGPT’s visibly selected **6 Pro** in the [review conversation](https://chatgpt.com/c/6ac0a907-1264-83e9-a834-fac2ab762c64); attachment hash/nonce were verified. Pro inspected the supplied excerpts and ran isolated probes, not our engine or rendered views. Local reproduction established and repaired missing binding-endpoint, behavior-performance and requirement-expression assertions. The expected-fact contract now checks the resolved operator, operand path and literal rather than accepting a matching phrase in documentation. Binding endpoints compare without imposing direction, and exchange multiplicities are retained.

Require unique claim locators and explicit `candidateCount` where a semantic assertion intends a unique target. Check each expected concern/root/mode, common source revision and rendered artifact identity; counting six outputs is insufficient. Require an explicit failure receipt for infrastructure failures rather than reporting partial generation as accepted. Source integrity, structured fact agreement, citation entailment, authorization and verification execution remain separate judgments.

Do not import an external review’s proposed approval policy automatically. Existing user authorization covers faithful routine transformations. Material inferred architecture and unresolved conflicts remain visible decisions under the governing modeling contract. No overall superiority, native-vendor interoperability or general professional-use acceptance was established by this review.
