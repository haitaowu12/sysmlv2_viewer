# System-specific model package assessment

`assess_package.py` generalizes acceptance beyond the cooler's fixed fixture. Start from the pumping-station package and replace its system-specific inputs, expected facts and scope. Do not copy its engineering assumptions into another system.

Prepare inputs and expected facts first. An input owner or authorized analyst reviews source authority, conflicting statements, acceptance-critical decisions and intended concerns. Keep `intake.json`, the fact contract, package manifest and decision register under deliberate change review; they are trusted inputs, not outputs to regenerate until a candidate passes. An actor who rewrites every trusted artifact can fabricate a consistent packet. This is not a cryptographic approval system.

The schema-1 package requires exactly these fields: `schemaVersion`, `model`, `views`, `contract`, `evidence`, `intake`, `factSupport`, `decisions`, `supportedDeclarationKinds`, `expectedViews`, `exchangeScopes`, `expectedExchanges`. File references must stay within the package, including after symlink resolution. The supplied pump fixture is the complete machine-readable example.

The independent gates are:

1. Canonical source bytes agree with the engine report and evidence model path.
2. Resolved model facts agree with the independent contract. For transitions, compare resolved source, target, each accept action's payload types and expected guard/effect counts. This does not execute a state machine or validate arbitrary guard/effect semantics.
3. Source quotations, byte revisions and explicit declaration coverage pass the evidence contract.
4. Every expected check has an identified source-backed claim with citations and explicit model targets. This records source-support review; it cannot establish entailment automatically.
5. Acceptance-blocking decisions are resolved through cited, modeled claims linked to fact checks. Every provisional claim must appear in the register, so removing a decision while retaining its conflict does not bypass the gate. Open questions outside the claims require an explicit reason and remain in the receipt. A conflict with no model target can still block acceptance through this separate register.
6. Every expected view has the exact ID, scope, mode and notation profile, one model revision and matching SVG bytes. Any omitted relationship must match a reviewed stable qualified name and reason. Unnamed unsupported omissions cannot silently be approved.
7. Directed exchanges match a multiset of scope/source occurrence/port/target occurrence/port/item. Distinct same-type usages and duplicate exchanges remain distinct.
8. Source-declaration metaclasses stay within the reviewed bounded construct list. This is a coarse scope gate, not qualification of every form of those metaclasses. Expressions, implicit machinery and other exclusions retain the evidence profile's limits.

The result binds all package files, report, qualifier inputs, runtime lock and implementation hashes. It records each failed gate. Fresh-run infrastructure/schema failures produce an explicit failed `assessment.json`; no partial run becomes success. Output directories are never reused.

Rendered usability and engineering adequacy are separate reviews. Inspect all requested views, decomposition/abstraction exclusions, source navigation, meaningful edits and restoration in the actual consumer. Pilot and custom renderers remain bounded. Native vendor interoperability, native modeled viewpoints, persistence, graphical edits, evaluated constraints and physical-system correctness require their own evidence.

## Lifecycle and decision binding update

Use schema-2 decision registers with `resolutionChecks`: nonempty reviewed fact IDs for resolved issues, empty for open issues. Fact support must match a selected subject or an explicitly checked referent. See [lifecycle workflow](LIFECYCLE.md) for draft regeneration, bounded analysis and the distinction between historical outcomes and current applicability. Production artifact registers and controlled lifecycle services are outside this standalone package.
