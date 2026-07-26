# Assurance Rule Schema

Rule pack `sysml-workbench/engineering-assurance` version `1.0.0` evaluates
only a current qualified semantic snapshot. Each deterministic finding
contains:

- stable finding id derived from rule and evidence;
- rule id/version and assurance domain;
- critical, major, minor, or advisory severity;
- statement and remediation;
- stable element/relationship identities;
- typed key/value evidence.

The initial pack implements direct requirement satisfaction/verification gaps
and interface ownership, endpoint completeness, endpoint typing, requirement
basis, and verification coverage. Results also include requirement-coverage
rows and an interface register.

The pack explicitly lists unavailable interface attributes rather than
inventing direction, units, protocol, capacity, timing, modes, failure,
safety, security, status, or assumptions. Indirect coverage is not claimed in
version 1.0.0.

Result SHA-256 is deterministic over canonical sorted data. Any rule change
must increment the pack version and update golden evidence.
