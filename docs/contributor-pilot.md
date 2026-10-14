# Contributor pilot

The contributor pilot is a bounded, source-backed workflow for people who need
to update engineering information without learning the model's package layout
or textual grammar. It is an implementation and qualification route for the
requirements, interfaces, and properties task surface. It is not a claim that
the workbench provides general SysML graphical authoring or a production-
qualified replacement runtime.

The source file remains authoritative. The workbench proposes typed commands,
validates them against a snapshot and document hashes, shows the resulting
change, and waits for explicit approval before writing source. The semantic
engine remains the authority for diagnostics, identity, navigation, and
relationships; the contributor surface is a task-specific projection over
that model.

The next increment adds [units, references and interface agreements](contributor-phase2.md), with a separately qualified offline installation route. The original fictional pilot and its receipt below remain the prior baseline.

## What is implemented

The primary surface is the **Requirements and interfaces** contributor task.
It currently provides:

- requirements, interfaces, and properties scopes backed by the selected
  source document and semantic snapshot;
- source-backed row selection, related-element links, diagnostics, source
  status, and selected-element details;
- documentation editing for engineering statements;
- typed property values for supported `string`, `number`, and `boolean`
  properties;
- supported scalar attribute editing, with unsupported scalar types disabled
  rather than silently converted;
- staging of several edits followed by one `batch-edit` proposal;
- a separate review step showing the proposed patch, diagnostics, and semantic
  effects;
- explicit **Approve and apply** after proposal validation;
- base snapshot and document-hash checks, stale proposal rejection, stable
  identity preservation, and read-only treatment of opaque source regions;
- clearing staged work and open proposals when the workspace snapshot changes;
- source-preserving undo and reopening through the existing command and
  workspace services.

The command boundary is deliberately small. The supported contributor commands
are `update-documentation`, `set-property`, `set-attribute-value`, and a
validated `batch-edit` containing those commands. A form or register is not a
second model: it emits the same typed proposal path used by other workbench
clients.

The surface does not decide the meaning of an engineering statement, approve a
requirement, execute a physical verification, or infer a value for a missing
field. Unsupported language constructs remain under model-steward control and
are reported as boundaries of the contributor profile.

## Fixture and behavioral contract

The deterministic fixture is
[`fixtures/workspaces/contributor-pilot/`](../fixtures/workspaces/contributor-pilot/).
It is a fictional infrastructure control example in which a contributor
revises an acknowledgement response provision from 120 ms to 80 ms. The
historical 95 ms observation against baseline A must remain visible. The
meaning of “acknowledgement” remains an open engineering question; this
workflow does not convert the edit into a physical-performance or compliance
claim.

The fixture contract requires the following behavior:

1. A proposal leaves canonical source bytes unchanged until approval.
2. Invalid input and stale bases fail with an actionable diagnostic.
3. A provision change and its related documentation can be applied as one
   coherent transaction.
4. Unrelated state declarations, comments, and the historical 95 ms literal
   survive the change.
5. Stable element identities survive the edit.
6. An affected review exposes a stale anchored finding.
7. Undo restores the source bytes exactly.
8. Reopening the workspace restores the expected semantic baseline.
9. A generated review report remains readable without an authoring
   installation.

The fixture's README records the fictional assumptions. The independent
expected source is [`fixtures/expected/contributor-pilot-candidate.sysml`](../fixtures/expected/contributor-pilot-candidate.sysml), outside the opened workspace. It must not be edited to make an automated qualification pass.

## Tests and qualification route

The focused implementation tests are colocated with the affected behavior:

- [`src/test/contributorSurface.test.tsx`](../src/test/contributorSurface.test.tsx)
  covers the contributor task, proposal/apply separation, typed forms, links,
  invalidation, diagnostics, and source-hash handling;
- [`packages/command-engine/src/index.test.ts`](../packages/command-engine/src/index.test.ts)
  covers command validation and transaction behavior;
- [`packages/command-engine/src/structured-source-edits.test.ts`](../packages/command-engine/src/structured-source-edits.test.ts)
  covers source-preserving edits;
- [`packages/command-engine/src/documentation.test.ts`](../packages/command-engine/src/documentation.test.ts)
  covers bounded documentation extraction and replacement.

Run the focused checks with:

```sh
npx vitest run src/test/contributorSurface.test.tsx packages/command-engine/src/index.test.ts packages/command-engine/src/structured-source-edits.test.ts packages/command-engine/src/documentation.test.ts
```

The end-to-end route is implemented by
[`scripts/workbench-qualify-contributor.ts`](../scripts/workbench-qualify-contributor.ts)
and exposed as `npm run qualify:contributor`. It copies the fixture to a
temporary workspace, creates a baseline, opens it through the configured
language adapter, exercises the proposal and approval path, checks stale
application rejection, creates a review finding and report, performs an
undo, and reopens the workspace.

Always select a runtime profile explicitly when qualifying a candidate:

```sh
npm run qualify:contributor -- --runtime-lock /absolute/path/to/candidate-runtime-lock.json --candidate-manifest /absolute/path/to/candidate-manifest.json --output generated/qualification/contributor-candidate.json
```

With the disposable candidate produced by the rebuild audit, the convenience
launcher supplies the candidate artifact, authoring executable, library, and
LSP command arguments:

The direct environment variables and license/provenance requirements are
listed in [`docs/developer-guide.md`](developer-guide.md). At minimum, the
qualification runner needs `SYSML_WORKBENCH_SEMANTIC_ARTIFACT`,
`SYSML_WORKBENCH_AUTHORING_ARTIFACT`, and `SYSML_WORKBENCH_LIBRARY_ROOT`.
The VinQut and Spec42 command/argument variables are also required when the
qualified hybrid adapter launches those processes. Omitting `--runtime-lock`
selects the production lock; that is intentional and must not be used to
silently turn a candidate run into a production claim.

The qualification output records the selected lock and manifest digests, implementation revision and dirty state, profile, fixture, checks,
diagnostics, report, and source hashes. Its scope is a fictional workflow
qualification. It does not establish human usability acceptance, physical
verification, enterprise-scale performance, signed distribution, Windows
qualification, or remote collaboration.

## Candidate runtime evidence

The original locked semantic JAR was not available in the local checkout or
the rebuild inputs. The production lock records the expected semantic artifact
hash as:

```text
8dc941e0e83fbdd063ee2e9148840fa2d5b80ad72f27d22c8267e61db52a5160
```

The candidate artifacts recorded by that audit are:

```text
semantic JAR:     4d79359b4ef2c2737f9713f65947147c6a3941d119a9985d139a56d10dafda4e
release index:    d010a8644265b8aadab103f1cc9024bb143b34d825ea2139e11590ee337cd8fe
Spec42 authoring: 22911d70f7f41251e257aef3ae4a3a402e77063d2271ed394a114834d7ee362e
```

The candidate index matched the locked official index in the rebuild audit,
and the candidate JAR was reproducible across the repeated shadow builds. The
candidate JAR did not match the production semantic hash above. Its lock is
therefore a candidate-only profile; it must not replace
[`config/language-engine-runtime-lock.json`](../config/language-engine-runtime-lock.json).

The initial rebuild exposed stale linking diagnostics during first load. A same-text revalidation cleared them, but its versionless push messages could not prove which revision had been validated. The adapter now retains errors when fresh validation cannot be established. It never treats a timeout or a versionless empty notification as successful corrective validation.

The candidate integration adds an optional `document-diagnostics-v1` response contract to `sysml/semanticEvidence`. In one Xtext read context it validates the resource and returns the document version, UTF-8 source SHA-256, completeness flag and diagnostics. An explicit candidate manifest enables this contract. The adapter accepts it only when URI, wire version and source digest agree with the document it sent; missing or inconsistent evidence leaves the prior errors visible. Delayed old push messages cannot clear the accepted result.

The default product manifest and production runtime lock are unchanged. The original rebuilt candidate is retained as earlier evidence; the correlated-validation candidate uses a separate lock and manifest. Read the latest strict qualification JSON for the selected artifact and actual outcome. The correction does not establish general language coverage or production release qualification.

## Rebuilding the candidate runtime

The rebuild was a disposable assembly exercise. It left the production
lock, default manifest, extractor and shared runtime checkout unchanged. The
checked-in Java overlay and adapter now carry the optional diagnostic contract
for this separately selected candidate. The pinned inputs
were:

```text
VinQut wrapper:       373dfb960860c3ac259f56169ddabc06d2847eca
Pilot implementation: fa709f28dfd49dfdb7ee83e4e19da2f57e0eb3aa
official release:     2026-05
official checkout:    de1070ae8e79c21532b8004fc663d47b35d0e9fa
Java:                 OpenJDK 21.0.8
Maven wrapper:        3.9.6
Gradle wrapper:       8.12
```

The source overlay and its intended build command are documented in the
[VinQut/Pilot semantic-evidence integration README](../integrations/vinqut-semantic-evidence/README.md).
The overlay adds the read-only `sysml/semanticEvidence` JSON-RPC method. It
does not make the Pilot model a second authority or mutate source.

To reproduce the disposable build, use the following order. Paths are examples
and must be replaced with the actual checked-out locations.

1. Check out the exact VinQut, Pilot, and official `2026-05` release commits.
2. Build the pinned Pilot implementation with the repository wrapper:

   ```sh
   ./mvnw clean package -DskipTests -Dxpect.tests.skip=true -T 2 --batch-mode
   ```

3. Run the checked-in JAR extractor against that exact Pilot build. Preserve
   the extracted Pilot library separately from the exact release library.
4. Assemble only a disposable VinQut `server/lib` and replace its
   `sysml.library` with the exact official release library.
5. Copy the two checked-in Java evidence files and apply the checked-in patch
   from the integration README.
6. Check the extracted dependency set before the first shadow build. The
   checked-in extractor omitted the rebuilt `org.omg.sysml.model` bundle in the
   audit; that bundle supplies `Element` and `SysMLPackage`. Add the exact
   rebuilt bundle to the disposable assembly when required.
7. Build the candidate:

   ```sh
   ./gradlew clean shadowJar
   ```

8. Generate the library index with the candidate runtime and the exact release
   library. The builder must load all release files and report zero errors:

   ```sh
   java -Xmx2g -cp build/libs/sysmlv2-lsp-server.jar org.omg.sysml.lsp.LibraryIndexBuilder /absolute/path/to/server/lib/sysml.library /absolute/path/to/server/src/main/resources/sysml-library.xtext-index
   ```

   The builder also required the rebuilt
   `org.omg.sysml.logic` bundle (`SysMLLogicStandaloneSetup`) in the
   disposable classpath during the audit. This is another extraction gap to
   check and repair from the exact pinned Pilot output; it is not permission to
   upgrade a dependency or edit the extractor as part of a qualification run.
9. Run `./gradlew clean shadowJar` again, repeat it once more, and compare the
   final JAR hashes. Run the retained JAR without an external `server/lib/*`
   classpath and rebuild the index again to prove that the packaged candidate
   carries the required runtime dependencies.
10. Record commands, commits, Java/tool versions, dependency repairs, hashes,
    logs, and the candidate lock alongside the disposable audit. Preserve the
    binary even when its hash differs from the production lock; the result is a
    candidate for separate review, not an automatic lock update.

The existing runtime disposition at
[`docs/licenses/vinqut-runtime-disposition.md`](licenses/vinqut-runtime-disposition.md)
remains the source for the repository's recorded license and provenance
decision. Rebuilding or copying a candidate does not expand that decision.

## Recorded candidate result

On 2026-10-12, the explicitly selected candidate-v2 passed all 14 strict
workflow checks. Baseline, applied candidate and restored baseline each had
zero semantic diagnostics. The deliberate `UnknownContributorScalar` input
produced a real linking error, failed validation and could not be applied.
The approved three-field batch matched the independently frozen candidate;
undo and reopening reproduced the baseline source exactly. The stale proposal
was rejected and the changed review anchor was marked stale. Generated HTML,
PDF and CSV report metadata recorded zero unresolved diagnostics.

The source fixture hashes were:

```text
baseline/restored: bf67757fca15149cf839a0a339aabce2a32ab71d4d3871a5cb99b7c40cf6cc4e
candidate:         bff2c4ae58519fc8267147101315c933daa53f4bc52d9aa69b96b4299388604b
```

## Qualification gates before deployment

The contributor qualification requires clean baseline, candidate and restored diagnostics, independent expected-source equality, invalid-type rejection without a source write, stale apply rejection, preserved identities and observations, report generation and byte-exact undo/reopen. Preserve its JSON output and logs for the exact candidate lock, manifest and implementation revision.

Only after those checks pass should the candidate receive a separate technical
review against the production runtime requirements. A production lock change
would require its own provenance, license, reproducibility, clean-machine,
platform, and usability gates. This document records the route and current
boundary; it does not authorize or imply that lock change.
