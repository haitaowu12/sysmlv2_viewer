# Maintained Modeling Lab baseline

This directory records the October14,2026 baseline of the maintained Modeling Lab, replacing the older product direction. The standalone implementation is in `modeling-lab/`. Its180 registered source files and package manifest are copied exactly from maintained source checkpoint `017d1cf1 (publication repairs over behavior baseline057196c1)`. The package remains the owner of its executable behavior, fixtures, tests and launch/recovery instructions. Do not patch a generated reader instead of its source/projection.

The full local workflow supports source-grounded bounded engineering changes, validation/review, occurrence-scoped views, named-view persistence, explicit project-file save/reopen and frozen reader export. It requires Python3.10+, Java21+, Graphviz and the pinned SysML Pilot runtime. `modeling-lab/LOCAL-HANDOFF.md` describes supported launch, save and recovery. The package manifest establishes source identity, not engineering approval.

Baseline evidence:55 UI tests pass; Python runs203 tests (197 pass,6 skip). The authored alarm study and independent engineering result pass nine semantic criteria; native validation, exact-view preservation and fresh-directory re-save checks pass. Human first-use acceptance, narrow-screen behavior, clean-machine/Windows and simultaneous-study support remain open. One active study per local server is supported.

GitHub Pages provides static hosting. The full Python/Java editing and validation service cannot run within Pages itself. Public-site mode and deployment verification are recorded separately; copying this source does not establish that the hosted site provides the local workflow. The previous app remains recoverable from Git history and is not an interchangeable semantic authority.

Publication packaging adds an explicit package-local Vitest configuration so a parent repository cannot change the Lab test runner. The obsolete product lint settings treat the standalone Lab harness as test code under the same explicit-any policy as existing repository tests. Its unused callback parameter is removed in the maintained source. No runtime behavior or view/model facts change.

Automated review repairs retain temporary exploration outside saved project recipes and allocate scenario view identifiers from their qualified target with collision resolution. The model name and source are preserved; two regression tests exercise these cases.
