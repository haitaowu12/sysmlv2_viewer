# Units, references and interface agreements

Fictional source-backed contributor fixture for the next deployment phase. The
baseline validates with candidate-v2 and the pinned official 2026-05 library.

Expected reviewed candidate: response duration changes from 120 ms to 0.08 s;
cable length from 2 m to an explicitly entered 2000 mm; equipment mass from
3 kg to an explicitly entered 3000 g. The editor performs no automatic unit
conversion. The selected equipment reference changes from field A to field B.
The interface target changes to the compatible conjugated receiver B; recorded
status becomes proposed with an owner and rationale. This does not authenticate
engineering approval. The historical 95 ms observation, open acknowledgement
meaning, nested lifecycle and comments remain unchanged.

The independently frozen expected source is outside the workspace at
`fixtures/expected/contributor-phase2-candidate.sysml`. Do not modify it merely
to make a generated candidate pass. Profile limits are explicit: simple literal
quantities, same-scope exactly typed references, and explicit interface fields.
Advanced expressions and unsupported shapes stay read-only.
