# Release Checklist

## Source and exact runtime

- [ ] clean checkout and `npm ci`;
- [ ] `npm run verify:release` passes without waiver flags;
- [ ] runtime hashes and official release commit match the lock;
- [ ] mandatory fixture and P1–P6 regression qualifications pass;
- [ ] medium benchmark uses five warmups and thirty samples;
- [ ] serious/critical axe findings are zero and manual contrast/keyboard
  review is recorded;
- [ ] production vulnerability and license policy have zero open blockers;
- [ ] deterministic archive rebuild produces the same SHA-256;
- [ ] copied bundle opens the pilot without network or repository paths.

## Security and operations

- [ ] threat-model critical risks have dated dispositions;
- [ ] product license and runtime redistribution obligations are approved;
- [ ] every claimed OS has clean-machine install/open/edit/report/recovery
  evidence;
- [ ] public artifacts are signed/notarized and verification is documented;
- [x] automated project backup/restore and hard-exit incomplete-command
  recovery are exercised with `npm run qualify:recovery`;
- [ ] signed-install clean-machine recovery and OS crash/log inspection pass
  on every claimed platform;
- [ ] runtime byte provenance conflicts emitted by
  `npm run release:runtime-provenance` are closed by owner/legal review;
- [ ] crash/log inspection confirms model content and credentials are absent.

## Product evidence

- [ ] product name and version approved;
- [ ] three independent pilot users complete all eight usability tasks;
- [ ] critical pilot findings closed and remaining findings owned/dated;
- [ ] capability matrix and README match implemented behavior;
- [ ] release manifest binds commit, runtime/library versions, rules, reports,
  diagnostics, exclusions, SBOM, and artifact hashes.

No tag, public release, or production claim is permitted while any mandatory
item remains open.
