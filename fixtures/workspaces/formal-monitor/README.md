# Fictional monitor acceptance fixture

This small illustrative model was authored during the September 29, 2026 audit following public-source research. It is not a SkyTrain/TREP design or an accepted real system architecture.

Expected independent facts:

- `context` owns one monitor and one external recorder.
- `Monitor` owns sensor and controller usages; their definitions remain distinct model elements.
- Sample exchange is defined once by the Samples port and SampleTransfer interface; receiver ports are conjugated.
- The sensor/controller interface and the controller/boundary binding are different relationships.
- Reporting has explicit start, receive, forward and done succession.
- Controller buffer capacity is 2; the requirement constrains it to at least 2.
- The verification definition names a planned objective. No test execution or passing verdict is asserted.

`views.json` selects context, decomposition, interconnection, behavior, requirement and verification projections from this one source. Static validation with the separately locked official Pilot returned no diagnostics. Required negative examples reject a part definition used as a port type, an unresolved import/type, and malformed syntax.

The fixture does not cover units, multiplicity variants, state transitions, allocations, variation points, repeated usage contexts or multi-file incremental reloading. Do not generalize its success to those capabilities.
