# Phase 7 Recovery and Runtime Provenance

Status: automated technical evidence passed; owner/platform/legal gates remain
Evidence baseline: `eb31dcfdc90f5e439985a5f23306bb495ce2c4f7`

## Recovery qualification

`npm run qualify:recovery` uses the locked qualified language runtime and a
copy of the Phase 5 infrastructure workspace. It:

1. records a semantic snapshot, stable identity set, and complete file/hash
   inventory;
2. creates a full project backup including source, identity registry, views,
   reviews, baselines, and evidence;
3. starts a separate command process and exits it with code `91` immediately
   after the first of two durable source replacements;
4. verifies the on-disk `COMMITTING` journal and mixed one-new/one-old source
   state;
5. runs normal startup recovery and requires a verified `ROLLED_BACK` result;
6. requires both source files to equal their original bytes;
7. restores the project backup to the same location; and
8. requires the restored tree hash, semantic snapshot hash, and stable
   identity set to match.

Observed result:

- four documents and 38 semantic elements;
- exactly one completed path at interruption;
- byte-exact transaction rollback;
- 11-file project tree hash
  `bc3bde415124b472f18465f8bf7997251ecb2cd2ec31d70dd6fcdf15ee5579b2`;
- restored semantic snapshot hash
  `6abeb7ae9667cd58a4910c57d9040891149efd7c168d6936517d5afee961ec72`;
- stable identity set preserved.

This closes automated backup/restore and interrupted-command recovery. It does
not replace a signed-installer clean-machine recovery exercise on every
claimed operating system.

## Retention control

`pruneWorkspaceTransactions` is an explicit, dry-run-by-default retention
operation. It validates every journal before selection, retains a configurable
number of newest finalized/rolled-back transactions, and can delete only those
two terminal states. Incomplete, committed-but-unverified, and conflict
records are protected. Tests prove dry-run behavior, bounded deletion, and
protection of a `PREPARED` transaction.

The journals contain source backups. Projects must set retention according to
their audit/privacy policy and preserve project/Git audit evidence before
applying deletion.

## Runtime byte provenance

`npm run release:runtime-provenance` checks the exact locked runtime and emits a
machine-readable inventory. The observation found:

- semantic fat JAR SHA-256
  `8dc941e0e83fbdd063ee2e9148840fa2d5b80ad72f27d22c8267e61db52a5160`;
- VinQut source commit `373dfb960860c3ac259f56169ddabc06d2847eca`;
- official Pilot commit `fa709f28dfd49dfdb7ee83e4e19da2f57e0eb3aa`;
- official release/library commit
  `de1070ae8e79c21532b8004fc663d47b35d0e9fa`;
- 15,040 fat-JAR entries, 13,787 classes, and 36 Maven component records;
- all ten `org.omg.*` local inputs match exact bytes in the pinned Pilot
  checkout;
- five same-named Eclipse UML inputs do not match the pinned Pilot copies.

The report makes no legal conclusion. It identifies three exact closure
items:

1. the VinQut NOTICE calls the Pilot content LGPL-3.0-or-later while the pinned
   official Pilot root license is EPL-2.0;
2. the source/license origin of the exact five differing UML JARs must be
   recorded; and
3. the product repository has no owner-approved root license.

Technical RC verification allows these conflicts only through the explicit
`--allow-license-conflict` path. Production verification fails closed.

## Log-safety check

The copied-bundle smoke now scans captured service output after workspace open.
It requires absence of:

- a known model-content marker from the opened fixture;
- the issued session bearer token; and
- the issued CSRF token.

The result and captured byte count are emitted with the copied-bundle evidence.
The machine-readable record is
`generated/release/evidence/phase7-copied-bundle-smoke.json`.
This is a bounded runtime-output check, not a substitute for clean-machine
crash-dump and operating-system log inspection.

## Remaining closure

- owner-approved product license and reconciled runtime notice set;
- authoritative provenance/license evidence for the five exact UML inputs;
- signed/notarized distribution for each claimed platform;
- clean-machine install, recovery, crash, and log inspection;
- three-person usability pilot and manual accessibility evidence;
- owner release-approval manifest.
