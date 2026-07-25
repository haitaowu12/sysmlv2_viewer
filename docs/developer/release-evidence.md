# Production Release Evidence

The production gate consumes external, versioned evidence. It does not accept
unchecked booleans, participant names, screenshots alone, or a copied example
manifest.

Authority:

- contract and validator:
  `packages/release-evidence/src/index.ts`;
- pending manifest example:
  `config/release-approval.example.json`;
- private working manifest:
  `config/release-approval.json`;
- private evidence records:
  `release/evidence/<version>/`;
- strict gate: `npm run verify:release`.

The private manifest and evidence directory are ignored by Git. Archive them
in the project's approved evidence repository after release. Do not place
participant names, proprietary model content, credentials, signing secrets, or
raw crash dumps in the records.

## Initialize a pending kit

First build the exact technical candidate:

```bash
npm run verify:release:technical
npm run release:init-evidence -- --platform darwin-arm64
```

The initializer:

- binds the current source commit;
- binds the current archive and runtime-provenance hashes when available;
- writes mode-0600 pending records;
- refuses to overwrite any existing evidence;
- records every result as pending/not-run;
- does not approve or infer a human result.

If the product license, source commit, runtime, or archive changes, discard the
obsolete kit only after preserving it as a superseded record, rebuild, and
initialize a new kit.

## Required evidence records

### Product license

Requires owner-approved SPDX identity and the exact committed root `LICENSE`
hash. The validator reads the real file and compares its bytes.

### Runtime license

Requires qualified owner/legal review of the exact semantic runtime hash and
the exact generated runtime-provenance report. The notice-conflict disposition
must explain the approved final notice set. A non-empty statement is evidence
of a decision, not proof that the decision is legally correct; accountable
review remains mandatory.

### Platform qualification

One record is required for every claimed platform. It binds the exact release
archive and requires a clean machine plus passed results for:

1. installation;
2. workspace open;
3. source edit and patch review;
4. report generation;
5. backup/restore;
6. interrupted-command recovery;
7. crash/log inspection; and
8. uninstall/recovery.

Network isolation and zero open critical/serious findings are mandatory.

### Distribution signing

One record is required for every claimed platform and must bind the same
archive as the platform record. Signature verification is mandatory. macOS
claims also require notarization. The signing identity and exact verification
command are recorded; private keys are never recorded.

### Manual accessibility

One record is required for every claimed platform. Keyboard navigation,
screen reader, rendered contrast, 200% zoom/scalable text, focus order,
non-colour status, diagram alternatives, and reduced motion must all pass.
Automated axe results do not replace this record.

### Usability

One record must contain at least three unique, independent participants. Each
participant must complete tasks 1–8 from
`docs/revamp/29-usability-pilot-protocol.md` unassisted. Every task records
elapsed seconds. Any assisted or failed task prevents approval until repaired
and rerun. No critical/serious finding may remain open.

## Validate before the full gate

After genuine results are recorded, compute every evidence file SHA-256 and
update the manifest references. Then set the manifest and owner approval to
approved:

```bash
npm run release:validate-approval -- --platform darwin-arm64
npm run verify:release
```

Validation fails on:

- missing, altered, duplicated, symlinked, or out-of-repository evidence;
- evidence outside `release/evidence/`;
- wrong version, source commit, runtime, provenance, platform, or archive;
- an uncommitted/mismatched product license;
- fewer than three participants or incomplete/assisted tasks;
- a missing manual accessibility check;
- unsigned or unnotarized distribution;
- incomplete clean-machine recovery/operations;
- any open critical/serious finding; or
- missing owner approval.

Passing this validator is necessary but not sufficient if the evidence itself
is dishonest. Reviewers must inspect the underlying observations and
attachments before approval.
