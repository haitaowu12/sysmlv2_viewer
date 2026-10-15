# Community syntax review controls

Original minimal examples for the 2026-10-02 audit of DeciSym/sysmlv2-skill at `bcfbd0cc35eb7b723f09995ce9f27bd62d4c236e`. No donor skill or executable validator was installed. `valid.sysml` exercises empty part definitions, implicitly based attribute definitions, enum definition/usages, a feature-reference multiplicity and an untyped attribute usage. These pass the pinned Pilot 0.52.0. That does not make every untyped declaration a useful engineering choice.

`invalid-enum.sysml` uses comma-separated enumerators and must fail. The valid enumeration uses semicolons. Replacing an enum with a String would lose its enumerated value domain and is not an equivalent repair.

Normative anchors: OMG SysML 2.0 Language [formal/26-03-02](https://www.omg.org/spec/SysML/2.0/Language/PDF), §§7.7–7.8, 8.2.2.6.6 (MultiplicityExpressionMember includes FeatureReferenceExpression), 8.2.2.7–8.2.2.8 and 8.2.2.11. This does not imply arbitrary arithmetic is permitted directly inside a multiplicity bracket.

Run `tools/reference-pilot/community_regressions.py` with the pinned JAR, library and fresh output directory. It inspects actual resolved metaclasses and the multiplicity bound's referent, rejects the malformed enum, and reproduces our former uncited-part acceptance gap. It is not a comparative generation benchmark or a claim about the donor's separate 0.52.1 validator.

The October 3 extension also rejects a missing import visibility prefix, in accordance with SysML §§7.5.3 and 8.2.2.5. It exercises self-binding, missing Controller performance, documentation-only thresholds, wrong constraint operands and duplicated directed flows against the strengthened contract.
