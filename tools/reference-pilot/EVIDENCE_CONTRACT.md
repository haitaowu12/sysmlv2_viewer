# Evidence contract, schema 1

`check_evidence.py` complements `check_contract.py`. Source validity, citation integrity, intended semantic facts and engineering judgment are separate gates. A valid citation does not prove the cited text supports the interpretation. Neither checker grants approval or proves verification execution.

Run after fresh validation, from any directory:

```sh
python3 -B /path/to/tools/reference-pilot/check_evidence.py \
  --report /path/to/fresh/report.json \
  --evidence /path/to/model-package/evidence-contract.json \
  --intake /path/to/reviewed/intake.json \
  --output /path/to/new-evidence-check.json
```

The evidence package is local and self-contained. The independently prepared `intake.json` is required: `{"schemaVersion":1,"sources":[{"id":"S1","path":"input.txt","sha256":"<input bytes>"}]}`. Its source catalog must match the ledger exactly; changing both a source and its evidence hash cannot silently change intake authority. Keep this manifest under the input owner’s change review, separate from candidate generation. This is a trusted input contract, not a cryptographic approval system: an actor who rewrites every trusted artifact can still fabricate a consistent package. Its relative paths cannot escape through parent traversal or symlinks. `model.path` identifies a single canonical source, whose SHA-256 must equal both the ledger and the report. Sources have immutable byte hashes and unique IDs. Each claim separates interpretation from exact, nonempty quotations at 1-based inclusive line ranges. For PDF, spreadsheets, transcripts or OCR, preserve a reviewed text/CSV extraction as the quoted source with upstream provenance in the surrounding evidence ledger. This checker does not validate the extraction process. Multi-file source sets are not supported by this schema; do not substitute an assembled hash and claim original-source coverage.

A small example of the shape (replace placeholders with actual SHA-256 values):

```json
{
  "schemaVersion": 1,
  "coverageProfile": "source-declarations-v1",
  "model": {"path": "model.sysml", "sha256": "<model bytes>"},
  "sources": [{"id": "S1", "path": "input.txt", "sha256": "<input bytes>"}],
  "claims": [{
    "id": "pump",
    "status": "source-backed",
    "interpretation": "Pump is an owned part of the system.",
    "citations": [{"source": "S1", "startLine": 1, "endLine": 1,
                   "quote": "The system owns a pump."}],
    "targets": [{"select": {"metaclass": "PartUsage", "qualifiedName": "System::pump"},
                 "sourceSha256": "<trimmed UTF-8 report element source>"}]
  }]
}
```

Selectors allow `metaclass` (required), `qualifiedName`, `owner` and `line`. Every selector must resolve to exactly one element; every target also binds its trimmed source text. An anonymous flow, binding, constraint or succession can use metaclass, owning qualified name and line. If these do not uniquely identify an element, fail and refine the source/selector; do not claim arbitrary UUIDs as stable identities. Named declarations are preferred, but their syntax must remain valid. These locators are revision-bound, not persistent rename identities.

`source-declarations-v1` requires explicit targets for all nonempty-source elements with a metaclass ending in `Definition` or `Usage`, plus `Package`, except unnamed `ReferenceUsage` expression fragments. This includes part usages, flow usages, interface usages, satisfaction, constraints, behavior succession, named references and source-bound endpoint usages. There is no automatic descendant coverage from citing a package or a part definition. Implicit elements with empty source, library elements, memberships, typing/redefinition edges, expressions, anonymous reference fragments and other metaclasses are outside this bounded profile; excluded metaclass counts are in every receipt. In particular, the coverage number does not prove multiplicity, typing or reference correctness: inspect their resolved facts with the independent semantic contract.

Claims marked `source-backed` or `user-confirmed` require citations and targets. Those labels record the analyst's evidence classification, not a machine finding of truth or an approval signature. A modeled `assumption`, `unresolved` or `conflict` claim cannot pass this source-backed acceptance gate. Keep such drafts available for review; unmodeled open questions with a separate interpretation and no targets may remain in the ledger. A caller needing hypothetical scenario acceptance must define a separate scenario contract, not relabel assumptions as sourced facts.

On an edit, retain the old ledger and receipt for comparison. Review the source delta, model delta and affected claims, then update hashes, anchors and targets deliberately. Never automatically regenerate the accepted ledger from candidate output during acceptance. Otherwise an invented element could receive an invented citation in the same operation. The cooler ledgers were created as a retrospective citation audit of existing candidates, not a new independent generation test. Original trial evidence remains alongside them.

The acceptance suite runs both evidence and semantic contracts and generates all six views. `community_regressions.py` deliberately adds an uncited part while rebinding revision metadata, demonstrating that coverage itself catches an addition that the earlier subset fact checks missed. `test_evidence.py` covers stale sources, false quotes, bad references, duplicate IDs, provisional claims, changed model/report/target source, extra parts/flows, path escapes and static failure.


## Resolved facts and receipt identity

Use `check_contract.py` alongside this gate. `candidateCount` constrains selector cardinality before expectation filtering, while `count` states how many selected candidates must meet the expected facts. The cooler contract requires exactly one boundary binding with the intended occurrence/feature endpoints, a Controller-owned `PerformActionUsage` typed by Regulate, and a constraint whose resolved operator/operand/literal structure is `cooler.controller.sampleCapacity >= 4`. The bounded `expression` predicate reads engine EMF fields and does not execute the constraint or parse a matching comment. `endpointsUnordered` compares endpoint multisets for symmetric bindings.

The common receipt binder records report, contract, evidence and intake hashes when supplied, controlling implementation hashes, runtime-lock identity and the qualification-input receipt. CLI and acceptance-suite hashes agree. The qualification report gives each generated view its source-model hash and SVG hash; acceptance checks six exact concern/scope/mode combinations, unique IDs, shared revision and artifact bytes. Exchanges are a multiset, so duplicates are not silently discarded. Acceptance records subprocess timeouts and missing/malformed report failures explicitly.

These checks still do not prove that a genuine quotation entails a relationship. Independently establish expected relationship predicates from the input, and review their source support. A paragraph cited against an entire definition is insufficient to claim that every contained semantic property is independently justified. The current cooler packet has bounded independent predicates; general atomic claim extraction, controlled approval records and whole-language evidence coverage remain unqualified.
