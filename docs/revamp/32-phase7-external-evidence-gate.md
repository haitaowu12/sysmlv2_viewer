# Phase 7 External Evidence Gate

Status: implemented and fail-closed; genuine evidence not yet supplied

The previous release-approval contract accepted owner booleans and participant
names without verifying the underlying evidence. That was insufficient for a
production gate.

The version 2 contract now requires six hash-bound evidence classes:

1. product-license approval;
2. runtime-license approval;
3. clean-machine platform qualification;
4. distribution signing/notarization;
5. manual accessibility qualification; and
6. the three-participant usability pilot.

Every record is bound to the exact product version and source commit. Runtime
approval is bound to the locked semantic artifact and deterministic provenance
report. Platform and signing records are bound to the same exact release
archive. Each claimed platform requires its own platform, signing, and
accessibility records.

The validator reads evidence only from the ignored private
`release/evidence/` area, rejects path escape and symlinks, verifies every file
SHA-256, and reads the actual committed product license. It requires:

- all eight clean-machine operational steps;
- all eight manual accessibility checks;
- at least three unique independent participants;
- all eight pilot tasks per participant;
- no assisted task; and
- zero open critical/serious findings.

The pending-kit initializer writes mode-0600 records, refuses overwrite, and
never marks a result passed. The standalone preflight currently fails with
`Release approval manifest is missing`, which is the correct repository state.

Qualification evidence:

- release-evidence tests: five passing;
- workbench suite: 20 files / 91 tests passing;
- full suite: 40 passing + 1 skipped files, 245 passing + 19 skipped tests;
- production npm audit: zero findings;
- two independently generated runtime-provenance reports were byte-identical.

This closes the implementation gap in how external evidence is validated. It
does not close the external gates themselves. Owner/legal decisions,
signed-platform exercises, accessibility review, and participant results must
be genuine and supplied before the strict release command can pass.
