# Rebuilt runtime regression qualification

Recorded 2026-10-13. The rebuilt candidate-v2 runtime passes the existing bounded
semantic, source-editing, review, report, controlled-AI and transaction-recovery
gates. The production runtime lock remains unchanged. These results qualify a
candidate regression profile; they do not establish a signed release, a clean OS
installation, full language conformance, scalability or practitioner acceptance.

## Exact runtime

- Semantic JAR: `4d79359b4ef2c2737f9713f65947147c6a3941d119a9985d139a56d10dafda4e`.
- Spec42 executable: `22911d70f7f41251e257aef3ae4a3a402e77063d2271ed394a114834d7ee362e`.
- Official library: release `2026-05`, commit `de1070ae8e79c21532b8004fc663d47b35d0e9fa`.
- Candidate manifest opts into `document-diagnostics-v1`; the diagnostic response
  must bind to the requested document version and source hash. See the candidate
  build and contract discussion in [the contributor pilot](contributor-pilot.md).

## Replayed gates

| Gate | Observed result | Scope |
|---|---|---|
| P2 semantic | Pass | 2 documents, 18 elements, 26 relationships, all eight existing relationship kinds; seven bounded queries; snapshot and IDs stable across reopen; zero diagnostics |
| P3 commands | Pass | Create proposal leaves source unchanged until approval; finalized transaction; byte-exact and semantic undo; clean reopen |
| P4 product integration | Component pass | Saved projection, source-draft proposal, semantic cross-navigation, approved apply and byte-exact undo; zero diagnostics |
| P5 engineering lifecycle | Pass | Injected unresolved reference reported; approved interface creation and requirement change; semantic baseline comparison; anchored review lifecycle and HTML/PDF/CSV report checks |
| P6 constrained AI | Pass | Unknown identity and non-user approval rejected; controlled rename survives reopen, preserves identity and produces its audit record |
| P7 recovery | Pass | Process exit after the first of two durable replacements; mixed `COMMITTING` journal; verified rollback; full backup tree, semantic snapshot and identity set restored |
| Multifile language fixture | Pass | 3 documents, zero diagnostics |
| Exact standard-library fixture | Pass | 95 documents including the official library, zero diagnostics |
| Malformed language fixture | Pass | One syntax error reported as required |
| Inventory-only preservation control | Skipped by existing contract | The fixture runner delegates this case to byte-preservation tests; no semantic claim |

P4 remains `component-pass` with `pending-integrated-usability-pilot`. Its reported
screenshot hashes refer to pre-existing repository assets, not new browser
observations. P5 checks report artifacts before its temporary workspace is removed;
the retained result contains the artifact inventory and hashes. The language
fixture discovery runner deliberately returns `outcome: incomplete` and exit 1,
even with passing executed assertions: it does not make the runtime selection or
production admission decision. Neither behavior has been weakened for this replay.

## Replay

The phase and recovery scripts now accept explicit `--candidate-manifest` and
`--runtime-lock` paths. Omitting them preserves the production defaults. Their
reports disclose whether an explicit candidate was selected. For example, from
the repository root, with `CANDIDATE` set to the retained candidate-v2 directory:

```sh
python3 "$CANDIDATE/run-candidate.py" npx tsx scripts/workbench-qualify-phase2.ts \
  --candidate-manifest "$CANDIDATE/candidate-manifest.json" \
  --runtime-lock "$CANDIDATE/candidate-runtime-lock.json" \
  --output /absolute/existing/output/phase2.json
```

Repeat with `phase3`, `phase4`, `phase5`, `phase6` and `recovery`. The fixture
discovery runner takes `--candidate-manifest` and `--candidate vinqut`. Set
`SYSML_WORKBENCH_OFFICIAL_RELEASE_DIR` to the exact official release checkout to
materialize and check the complete source-tree library. It checks the checkout
commit before copying the library; this is not direct `.kpar` loading.

The separate installation replay must establish relocated startup with no original
checkout/runtime dependency. A clean user environment on this existing host does
not establish clean-machine OS, signing, notarization, Windows, crash-dump or
operational deployment qualification. Medium/large performance and human pilot
results must be qualified separately before expanding the release profile.
