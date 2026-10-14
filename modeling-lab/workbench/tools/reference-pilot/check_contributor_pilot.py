#!/usr/bin/env python3
"""Check the independent facts for the source-backed contributor pilot.

This checker consumes two already qualified, managed reports.  It binds each
report to the source bytes supplied on the command line before it reads model
facts, then compares those facts with the separately authored
``expected-facts.json`` record.  The expected-facts record is deliberately not
generated from either report.

The check is a bounded qualification of the fixture.  It does not establish
physical timing, verification execution, usability, project approval, or
production readiness.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter
from pathlib import Path
from typing import Any, Callable, Mapping

from check_contract import documentation_facts, facts
from engineering import index_report, interconnection, sem
from report_integrity import load_report


TARGET_SYSTEM = "ContributorPilot::InfrastructureControlSystem"
_COMMENT_RE = re.compile(r"/\*.*?\*/", re.DOTALL)
_ADVANCED_STATE_RE = re.compile(
    r"^\s*state\s+def\s+UnrelatedAdvancedLifecycle\s*\{.*?^\s*\}",
    re.MULTILINE | re.DOTALL,
)


def _digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _read_json(path: Path) -> Mapping[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, Mapping):
        raise ValueError(f"{path} must contain a JSON object")
    return value


def _record(results: list[dict[str, Any]], check_id: str, passed: bool, **detail: Any) -> None:
    result: dict[str, Any] = {"id": check_id, "passed": bool(passed)}
    result.update(detail)
    results.append(result)


def _safe(
    results: list[dict[str, Any]],
    check_id: str,
    operation: Callable[[], Any],
) -> Any:
    """Run one check without allowing a malformed report to hide other results."""

    try:
        value = operation()
    except Exception as error:  # a report is untrusted evidence at this boundary
        _record(results, check_id, False, error=str(error))
        return None
    return value


def _finish(results: list[dict[str, Any]]) -> dict[str, Any]:
    passed = sum(1 for result in results if result["passed"])
    failed = len(results) - passed
    return {
        "passed": failed == 0 and bool(results),
        "checkCount": len(results),
        "passedCount": passed,
        "failedCount": failed,
        "results": results,
        "limits": [
            "Checks compare the declared fixture facts and managed report evidence only.",
            "No physical timing, simulation, verification execution, human usability, project approval, or production readiness is established.",
        ],
    }


def _expected_shape(expected: Mapping[str, Any]) -> None:
    if expected.get("schemaVersion") != 1:
        raise ValueError("expected facts require schemaVersion 1")
    if expected.get("fixtureId") != "contributor-pilot":
        raise ValueError("expected facts are for the contributor-pilot fixture")
    models = expected.get("models")
    if not isinstance(models, Mapping) or not {"baselineA", "candidateB"} <= set(models):
        raise ValueError("expected facts require baselineA and candidateB model records")
    for label in ("baselineA", "candidateB"):
        model = models[label]
        if not isinstance(model, Mapping):
            raise ValueError(f"expected model {label} must be an object")
        sha = model.get("sha256")
        if not isinstance(sha, str) or not re.fullmatch(r"[0-9a-f]{64}", sha):
            raise ValueError(f"expected model {label} requires a SHA-256 source hash")
        required = ("responseProvision", "historicalObservation", "requirement", "verification")
        if label == "baselineA":
            required = (*required, "interface")
        for key in required:
            if not isinstance(model.get(key), Mapping):
                raise ValueError(f"expected model {label} requires {key}")
        requirement = model["requirement"]
        if not isinstance(requirement.get("subjectType"), str) or not requirement["subjectType"].strip():
            raise ValueError(f"expected model {label} requires a nonempty requirement subjectType")
        verification = model["verification"]
        if any(not isinstance(verification.get(key), str) or not verification[key].strip()
               for key in ("qualifiedName", "metaclass", "target")):
            raise ValueError(f"expected model {label} requires a verification identity, metaclass and target")
        if verification.get("status") != "planned-not-executed":
            raise ValueError(f"expected model {label} requires planned-not-executed verification")
    unresolved = expected.get("sharedFacts", {}).get("unresolvedMeaning")
    if not isinstance(unresolved, Mapping) or unresolved.get("status") != "open":
        raise ValueError("expected facts require an open unresolved acknowledgement meaning")


def _unique_element(report: Mapping[str, Any], qualified_name: str) -> tuple[dict[str, Any], dict[str, Any]]:
    elements = report.get("elements")
    if not isinstance(elements, list):
        raise ValueError("report elements are missing")
    index = index_report(report)
    matches = [element for element in elements if element.get("qualifiedName") == qualified_name]
    if len(matches) != 1:
        raise ValueError(f"expected exactly one element named {qualified_name}; found {len(matches)}")
    return matches[0], index


def _reference_name(reference: Any, index: Mapping[str, Mapping[str, Any]]) -> str | None:
    if not isinstance(reference, Mapping):
        return None
    element = index.get(reference.get("id"))
    if not element:
        return None
    return element.get("qualifiedName") or element.get("name")


def _subject_resolution(
    element: Mapping[str, Any], index: Mapping[str, Mapping[str, Any]]
) -> tuple[str | None, list[str]]:
    """Resolve a requirement subject usage and then its engine-resolved types.

    A requirement's ``subjectParameter`` is a usage owned by the requirement;
    its qualified name is therefore not the subject type.  The type chain on
    that usage is the semantic fact that the expected-facts record asserts.
    """

    subject = sem(element, "subjectParameter") or sem(element, "subject")
    if not isinstance(subject, Mapping):
        return None, []
    usage = index.get(subject.get("id"))
    if not usage:
        return subject.get("qualifiedName"), []
    usage_name = usage.get("qualifiedName") or subject.get("qualifiedName")
    type_refs = sem(usage, "type", [])
    if isinstance(type_refs, Mapping):
        type_refs = [type_refs]
    type_names = []
    for reference in type_refs if isinstance(type_refs, list) else []:
        if not isinstance(reference, Mapping):
            continue
        name = reference.get("qualifiedName") or _reference_name(reference, index)
        if name:
            type_names.append(name)
    return usage_name, type_names


def _comment_containing(source: str, marker: str) -> str | None:
    for match in _COMMENT_RE.finditer(source):
        if marker in match.group(0):
            return match.group(0)
    return None


def _advanced_state_block(source: str) -> str | None:
    match = _ADVANCED_STATE_RE.search(source)
    return match.group(0) if match else None


def _source_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _model_facts(
    results: list[dict[str, Any]],
    label: str,
    report: Mapping[str, Any],
    source_path: Path,
    expected_model: Mapping[str, Any],
    shared_facts: Mapping[str, Any],
) -> None:
    prefix = label.lower()
    index = index_report(report)

    response_expected = expected_model["responseProvision"]
    response, _ = _unique_element(report, response_expected["qualifiedName"])
    response_facts = facts(response, index)
    _record(
        results,
        f"{prefix}.response-provision",
        response_facts["metaclass"] == response_expected["metaclass"]
        and response_facts["literalValues"] == [response_expected["literalValue"]],
        qualifiedName=response_facts["qualifiedName"],
        metaclass=response_facts["metaclass"],
        literalValues=response_facts["literalValues"],
        expectedLiteral=response_expected["literalValue"],
        unit=response_expected.get("unit"),
    )

    historical_expected = expected_model["historicalObservation"]
    historical, _ = _unique_element(report, historical_expected["qualifiedName"])
    historical_facts = facts(historical, index)
    _record(
        results,
        f"{prefix}.historical-observation",
        historical_facts["metaclass"] == historical_expected["metaclass"]
        and historical_facts["literalValues"] == [historical_expected["literalValue"]],
        qualifiedName=historical_facts["qualifiedName"],
        metaclass=historical_facts["metaclass"],
        literalValues=historical_facts["literalValues"],
        expectedLiteral=historical_expected["literalValue"],
        identity=historical_expected.get("identity"),
    )

    requirement_expected = expected_model["requirement"]
    requirement, _ = _unique_element(report, requirement_expected["qualifiedName"])
    requirement_facts = facts(requirement, index)
    subject_usage, subject_types = _subject_resolution(requirement, index)
    direct_docs = documentation_facts(requirement, index)
    bodies = [doc["body"] for doc in direct_docs]
    required_fragments = [
        requirement_expected["provisionText"],
        "ACK-MEANING-01",
        "accepted dispatch message",
        "completed field action",
    ]
    _record(
        results,
        f"{prefix}.requirement-classification-and-subject",
        requirement_facts["metaclass"] == requirement_expected["metaclass"]
        and subject_types == [requirement_expected["subjectType"]],
        qualifiedName=requirement_facts["qualifiedName"],
        metaclass=requirement_facts["metaclass"],
        subjectUsage=subject_usage,
        subjectTypes=subject_types,
        expectedMetaclass=requirement_expected["metaclass"],
        expectedSubjectType=requirement_expected["subjectType"],
    )
    _record(
        results,
        f"{prefix}.requirement-direct-documentation",
        len(direct_docs) == 1 and all(fragment in bodies[0] for fragment in required_fragments),
        directDocumentationCount=len(direct_docs),
        documentationBodies=bodies,
        requiredFragments=required_fragments,
    )

    verification_expected = expected_model["verification"]
    verification, _ = _unique_element(report, verification_expected["qualifiedName"])
    verified_refs = sem(verification, "verifiedRequirement", [])
    verified_names = [_reference_name(ref, index) for ref in verified_refs] if isinstance(verified_refs, list) else []
    _record(
        results,
        f"{prefix}.verification-classification-and-target",
        verification.get("metaclass") == verification_expected["metaclass"]
        and verified_names == [verification_expected["target"]],
        qualifiedName=verification.get("qualifiedName"),
        metaclass=verification.get("metaclass"),
        verifiedRequirements=verified_names,
        expectedMetaclass=verification_expected["metaclass"],
        expectedTarget=verification_expected["target"],
    )
    verification_docs = documentation_facts(verification, index)
    verification_bodies = [re.sub(r"\s+", " ", doc["body"]).strip() for doc in verification_docs]
    _record(
        results,
        f"{prefix}.verification-planned-status",
        len(verification_bodies) == 1
        and "Planned verification only." in verification_bodies[0]
        and "No procedure, instrumentation, calibration applicability, execution or acceptance is supplied." in verification_bodies[0],
        documentationBodies=verification_bodies,
        expectedStatus=verification_expected["status"],
        boundary="Checks the fixture's declared planning status; no executed verification is inferred.",
    )

    interface_expected = expected_model["interface"]
    interface, _ = _unique_element(report, interface_expected["definition"])
    _record(
        results,
        f"{prefix}.interface-definition",
        interface.get("qualifiedName") == interface_expected["definition"],
        qualifiedName=interface.get("qualifiedName"),
        expected=interface_expected["definition"],
    )

    advanced_expected = (
        expected_model.get("advanced")
        or expected_model.get("unrelatedAdvanced")
        or {}
    )
    preservation = shared_facts.get("unrelatedPreservation", {})
    advanced_name = advanced_expected.get("qualifiedName") or preservation.get("advancedElement")
    advanced_kind = advanced_expected.get("metaclass") or preservation.get("advancedElementKind")
    if advanced_name:
        advanced, _ = _unique_element(report, advanced_name)
        _record(
            results,
            f"{prefix}.advanced-state",
            advanced.get("metaclass") == advanced_kind,
            qualifiedName=advanced.get("qualifiedName"),
            metaclass=advanced.get("metaclass"),
            expectedMetaclass=advanced_kind,
        )
        advanced_source = advanced.get("source", "")
        _record(
            results,
            f"{prefix}.advanced-state-transition",
            all(token in advanced_source for token in ("idle", "active"))
            if advanced_source
            else "idle" in _source_text(source_path) and "active" in _source_text(source_path),
            source=advanced_source,
            expectedTransitions=preservation.get("expectedTransitions", []),
        )


def _endpoint_label(pair: Any, index: Mapping[str, Mapping[str, Any]]) -> tuple[str, str]:
    if not isinstance(pair, (list, tuple)) or len(pair) != 2:
        raise ValueError("projected flow endpoint is not a direct part.port pair")
    part = index.get(pair[0])
    port = index.get(pair[1])
    if not part or not port:
        raise ValueError("projected flow endpoint is missing from the report")
    part_name = part.get("name") or (part.get("qualifiedName") or "").split("::")[-1]
    port_name = port.get("name") or (port.get("qualifiedName") or "").split("::")[-1]
    if not part_name or not port_name:
        raise ValueError("projected flow endpoint has no names")
    return str(part_name), str(port_name)


def _flow_signatures(projection: Mapping[str, Any], index: Mapping[str, Mapping[str, Any]]) -> list[tuple[str, str, str, str]]:
    signatures: list[tuple[str, str, str, str]] = []
    for flow in projection.get("flows", []):
        source_part, source_port = _endpoint_label(flow.get("source"), index)
        target_part, target_port = _endpoint_label(flow.get("target"), index)
        item = str(flow.get("item"))
        if source_part == "controller" and target_part in {"fieldA", "fieldB"}:
            direction = "controller-to-field"
            field = target_part
        elif target_part == "controller" and source_part in {"fieldA", "fieldB"}:
            direction = "field-to-controller"
            field = source_part
        else:
            direction = "unsupported"
            field = source_part
        signatures.append((item, direction, field, f"{source_part}.{source_port}->{target_part}.{target_port}"))
    return signatures


def _check_projected_flows(
    results: list[dict[str, Any]],
    label: str,
    report: Mapping[str, Any],
    expected_model: Mapping[str, Any],
) -> None:
    prefix = label.lower()
    interface_expected = expected_model["interface"]
    projection = interconnection(report, TARGET_SYSTEM)
    index = index_report(report)
    actual = _flow_signatures(projection, index)
    expected_roles = []
    for field in ("fieldA", "fieldB"):
        for flow in interface_expected["flows"]:
            direction = flow["direction"]
            expected_roles.append((flow["item"], direction, field))
    actual_roles = [(item, direction, field) for item, direction, field, _ in actual]
    _record(
        results,
        f"{prefix}.interconnection-directed-flows",
        Counter(actual_roles) == Counter(expected_roles)
        and len(projection.get("connectors", [])) == 2
        and not projection.get("excluded"),
        projectedFlows=[{
            "item": item,
            "direction": direction,
            "field": field,
            "endpoints": endpoints,
        } for item, direction, field, endpoints in actual],
        expectedFlows=expected_roles,
        connectorCount=len(projection.get("connectors", [])),
        excluded=projection.get("excluded", []),
    )


def _compare_comment_preservation(
    results: list[dict[str, Any]],
    baseline_source: Path,
    candidate_source: Path,
    expected: Mapping[str, Any],
) -> None:
    markers = expected["sharedFacts"]["unrelatedPreservation"].get("commentMarkers", [])
    baseline_text = _source_text(baseline_source)
    candidate_text = _source_text(candidate_source)
    for marker in markers:
        before = _comment_containing(baseline_text, marker)
        after = _comment_containing(candidate_text, marker)
        _record(
            results,
            f"preservation.comment.{marker}",
            before is not None and before == after,
            marker=marker,
            baselineComment=before,
            candidateComment=after,
        )
    baseline_state = _advanced_state_block(baseline_text)
    candidate_state = _advanced_state_block(candidate_text)
    _record(
        results,
        "preservation.advanced-state-source-exact",
        baseline_state is not None and baseline_state == candidate_state,
        baselineState=baseline_state,
        candidateState=candidate_state,
    )


def _compare_unresolved_source(
    results: list[dict[str, Any]],
    baseline_source: Path,
    candidate_source: Path,
    baseline_report: Mapping[str, Any],
    candidate_report: Mapping[str, Any],
    expected: Mapping[str, Any],
) -> None:
    unresolved = expected["sharedFacts"]["unresolvedMeaning"]
    required = [unresolved["id"], *unresolved.get("alternatives", [])]
    source_texts = {
        "baselineA": _source_text(baseline_source),
        "candidateB": _source_text(candidate_source),
    }
    direct_bodies = {}
    for label, report in (("baselineA", baseline_report), ("candidateB", candidate_report)):
        req, index = _unique_element(report, expected["models"][label]["requirement"]["qualifiedName"])
        direct_bodies[label] = [doc["body"] for doc in documentation_facts(req, index)]
    _record(
        results,
        "unresolved.acknowledgement-meaning-remains-explicit",
        all(all(token in source for token in required) for source in source_texts.values())
        and all(all(token in body for body in direct_bodies[label]) for token in required for label in direct_bodies),
        expectedStatus=unresolved.get("status"),
        selected=unresolved.get("selected"),
        requiredSourceTokens=required,
        directDocumentation=direct_bodies,
    )


def compare_reports(
    baseline_report: Mapping[str, Any],
    baseline_source: Path,
    candidate_report: Mapping[str, Any],
    candidate_source: Path,
    expected: Mapping[str, Any],
) -> dict[str, Any]:
    """Compare already loaded reports; callers must have bound report bytes first."""

    results: list[dict[str, Any]] = []
    _safe(results, "expected.facts-schema", lambda: _expected_shape(expected))
    if results and not results[-1]["passed"]:
        return _finish(results)

    for label, report, source_path, model_key in (
        ("baselineA", baseline_report, baseline_source, "baselineA"),
        ("candidateB", candidate_report, candidate_source, "candidateB"),
    ):
        prefix = label.lower()
        model = dict(expected["models"][model_key])
        # The interface definition and its directed roles are shared fixture
        # facts; candidateB intentionally omits that duplicate block.
        model.setdefault("interface", expected["models"]["baselineA"]["interface"])
        source_bytes = _safe(results, f"{prefix}.source-readable", lambda: source_path.read_bytes())
        if source_bytes is None:
            continue
        source_hash = _digest(source_bytes)
        _record(
            results,
            f"{prefix}.source-hash",
            source_hash == model["sha256"] and report.get("sourceSha256") == model["sha256"],
            actualSourceSha256=source_hash,
            reportSourceSha256=report.get("sourceSha256"),
            expectedSourceSha256=model["sha256"],
        )
        _record(
            results,
            f"{prefix}.managed-static-evidence",
            report.get("reportIntegrity", {}).get("status") == "verified-managed"
            and report.get("staticChecksPassed") is True,
            reportIntegrity=report.get("reportIntegrity", {}).get("status"),
            staticChecksPassed=report.get("staticChecksPassed"),
        )
        _safe(
            results,
            f"{prefix}.semantic-facts",
            lambda: _model_facts(
                results,
                label,
                report,
                source_path,
                model,
                expected["sharedFacts"],
            ),
        )
        _safe(results, f"{prefix}.interconnection-projection", lambda: _check_projected_flows(results, label, report, model))

    _safe(
        results,
        "preservation.comments-exact",
        lambda: _compare_comment_preservation(results, baseline_source, candidate_source, expected),
    )
    _safe(
        results,
        "unresolved.source-explicit",
        lambda: _compare_unresolved_source(
            results, baseline_source, candidate_source, baseline_report, candidate_report, expected
        ),
    )
    return _finish(results)


def verify_paths(
    baseline_report: Path,
    baseline_source: Path,
    candidate_report: Path,
    candidate_source: Path,
    expected_path: Path,
) -> dict[str, Any]:
    """Load managed reports with source-byte binding and run the comparison."""

    results: list[dict[str, Any]] = []
    expected = _safe(results, "expected.facts-load", lambda: _read_json(expected_path))
    if expected is None:
        return _finish(results)

    loaded: dict[str, Mapping[str, Any]] = {}
    for label, report_path, source_path in (
        ("baselineA", baseline_report, baseline_source),
        ("candidateB", candidate_report, candidate_source),
    ):
        report = _safe(
            results,
            f"{label.lower()}.managed-report-source-binding",
            lambda report_path=report_path, source_path=source_path: load_report(report_path, source=source_path),
        )
        if report is not None:
            loaded[label] = report
    if len(loaded) != 2:
        return _finish(results)

    compared = compare_reports(
        loaded["baselineA"], baseline_source, loaded["candidateB"], candidate_source, expected
    )
    results.extend(compared["results"])
    return _finish(results)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-report", type=Path, required=True)
    parser.add_argument("--baseline-source", type=Path, required=True)
    parser.add_argument("--candidate-report", type=Path, required=True)
    parser.add_argument("--candidate-source", type=Path, required=True)
    parser.add_argument("--expected", type=Path, required=True)
    args = parser.parse_args(argv)
    result = verify_paths(
        args.baseline_report,
        args.baseline_source,
        args.candidate_report,
        args.candidate_source,
        args.expected,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if result["passed"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
