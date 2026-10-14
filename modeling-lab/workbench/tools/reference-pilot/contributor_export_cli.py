"""Export a frozen contributor fixture review from managed Pilot evidence.

This command is a reference-side oracle.  It reads a managed qualification
reports, their exact source snapshots, a contributor profile, and a separately
supplied baseline source.  It never runs the modeling runtime, edits a source,
stores a candidate, or records candidate acceptance.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import re
from pathlib import Path
from typing import Any, Mapping

from check_contract import facts
from contributor_export import render_review
from engineering import index_report
from report_integrity import load_report


__all__ = ["build_review_state", "main"]


_HEX_SHA256 = re.compile(r"^[0-9a-f]{64}$")


def sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _as_mapping(value: Any, label: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise ValueError(f"{label} must be an object")
    return value


def _as_list(value: Any, label: str) -> list[Any]:
    if not isinstance(value, list):
        raise ValueError(f"{label} must be a list")
    return value


def _qualified(report: Mapping[str, Any], target: Any, label: str) -> Mapping[str, Any]:
    if not isinstance(target, str) or not target.strip():
        raise ValueError(f"{label} requires an exact qualified target")
    matches = [element for element in report.get("elements", []) if element.get("qualifiedName") == target]
    if len(matches) != 1:
        raise ValueError(f"{label} target must resolve exactly once: {target}")
    return matches[0]


def _decimal_value(element: Mapping[str, Any], index: Mapping[str, Mapping[str, Any]], label: str) -> int | float:
    values = facts(element, index).get("literalValues", [])
    if len(values) != 1 or isinstance(values[0], bool) or not isinstance(values[0], (int, float)):
        raise ValueError(f"{label} requires exactly one numeric literal from the managed report")
    return values[0]


def _direct_documentation(element: Mapping[str, Any], index: Mapping[str, Mapping[str, Any]], label: str) -> str:
    bodies = facts(element, index).get("documentationBodies", [])
    bodies = [body for body in bodies if isinstance(body, str)]
    if len(bodies) != 1:
        raise ValueError(f"{label} requires exactly one directly owned documentation body")
    return bodies[0]


def _clean_text(value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("Documentation body must be nonempty text")
    return value


def _bind_evidence(profile: Mapping[str, Any], baseline_report: Mapping[str, Any], current_report: Mapping[str, Any], baseline_digest: str) -> list[dict[str, Any]]:
    baseline_index = index_report(baseline_report)
    current_index = index_report(current_report)
    bound: list[dict[str, Any]] = []
    for index, item in enumerate(_as_list(profile.get("evidence", []), "profile.evidence")):
        evidence = dict(_as_mapping(item, f"profile.evidence[{index}]"))
        identifier = evidence.get("id")
        if not isinstance(identifier, str) or not identifier.strip():
            raise ValueError(f"profile.evidence[{index}] requires an ID")
        source_revision = evidence.get("sourceRevision")
        if source_revision in (None, "", "initial", "baseline"):
            evidence["sourceRevision"] = baseline_digest
        elif source_revision != baseline_digest:
            if isinstance(source_revision, str) and _HEX_SHA256.fullmatch(source_revision):
                raise ValueError(f"Historical evidence {identifier} is bound to a different baseline source")
            raise ValueError(f"Historical evidence {identifier} must use initial/baseline or the baseline SHA-256")
        target = evidence.get("target")
        if target in (None, ""):
            evidence["preservationStatus"] = "supplied-observation-unverified"
            note = "Semantic preservation was not proven because this manifest observation has no qualified target."
            evidence["explanation"] = ((str(evidence.get("explanation", "")).strip() + " " + note).strip())
        else:
            if "observedValue" not in evidence:
                raise ValueError(f"Evidence {identifier} with target {target} requires observedValue")
            baseline_element = _qualified(baseline_report, target, f"Evidence {identifier} baseline")
            current_element = _qualified(current_report, target, f"Evidence {identifier} current")
            baseline_values = facts(baseline_element, baseline_index).get("literalValues", [])
            current_values = facts(current_element, current_index).get("literalValues", [])
            expected = evidence["observedValue"]
            if len(baseline_values) != 1 or baseline_values[0] != expected:
                raise ValueError(f"Evidence {identifier} differs from its baseline managed report fact")
            if len(current_values) != 1 or current_values[0] != expected:
                raise ValueError(f"Evidence {identifier} differs from its current managed report fact")
            evidence["preservationStatus"] = "exact-qualified-target"
        bound.append(evidence)
    return bound


def _hydrate_rows(profile: Mapping[str, Any], report: Mapping[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    index = index_report(report)
    rows: list[dict[str, Any]] = []
    changes: list[dict[str, Any]] = []
    for row_index, original_row in enumerate(_as_list(profile.get("rows", []), "profile.rows")):
        row = copy.deepcopy(_as_mapping(original_row, f"profile.rows[{row_index}]"))
        row_target = row.get("target")
        _qualified(report, row_target, f"profile.rows[{row_index}]")
        fields: list[dict[str, Any]] = []
        for field_index, original_field in enumerate(_as_list(row.get("fields", []), f"profile.rows[{row_index}].fields")):
            field = copy.deepcopy(_as_mapping(original_field, f"profile.rows[{row_index}].fields[{field_index}]"))
            kind = field.get("kind")
            target = field.get("target")
            element = _qualified(report, target, f"profile.rows[{row_index}].fields[{field_index}]")
            if kind == "decimal":
                value = _decimal_value(element, index, f"Decimal field {target}")
                minimum = field.get("minimum")
                if isinstance(minimum, (int, float)) and not isinstance(minimum, bool) and value < minimum:
                    raise ValueError(f"Decimal field {target} is below its declared minimum")
                field["value"] = value
            elif kind == "text":
                field["value"] = _clean_text(_direct_documentation(element, index, f"Text field {target}"))
            elif kind == "reference":
                if field.get("options") and target not in field["options"]:
                    raise ValueError(f"Reference field {target} is outside its declared options")
                field["value"] = target
                field["editable"] = False
            else:
                raise ValueError(f"Unsupported contributor field kind: {kind}")
            fields.append(field)
            if kind in {"decimal", "text"}:
                # The baseline-side comparison is attached later from a
                # second managed report, using the same exact target.
                changes.append({"rowId": row.get("id"), "fieldId": field.get("id"), "label": field.get("label"),
                                "target": target, "kind": kind, "after": field.get("value"), "unit": field.get("unit")})
        row["fields"] = fields
        rows.append(row)
    return rows, changes


def _normalise_document(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value)).strip()


def _attach_changes(changes: list[dict[str, Any]], baseline_report: Mapping[str, Any]) -> list[dict[str, Any]]:
    index = index_report(baseline_report)
    result: list[dict[str, Any]] = []
    for change in changes:
        element = _qualified(baseline_report, change["target"], f"Baseline change target {change['target']}")
        selected = facts(element, index)
        if change["kind"] == "decimal":
            values = selected.get("literalValues", [])
            if len(values) != 1 or isinstance(values[0], bool) or not isinstance(values[0], (int, float)):
                raise ValueError(f"Baseline decimal target requires exactly one numeric managed fact: {change['target']}")
            before = values[0]
        elif change["kind"] == "text":
            bodies = [body for body in selected.get("documentationBodies", []) if isinstance(body, str)]
            if len(bodies) != 1:
                raise ValueError(f"Baseline text target requires exactly one direct documentation fact: {change['target']}")
            before = bodies[0]
        else:
            raise ValueError(f"Unsupported baseline field kind: {change['kind']}")
        comparable_before = _normalise_document(before) if change["kind"] == "text" else before
        comparable_after = _normalise_document(change["after"]) if change["kind"] == "text" else change["after"]
        if comparable_before != comparable_after:
            result.append({key: value for key, value in change.items() if key not in {"target", "kind"}} | {"before": before})
    return result


def _safe_artifact(report_path: Path, name: Any) -> Path:
    if not isinstance(name, str) or not name:
        raise ValueError("Managed view artifact name is missing")
    base = report_path.parent.resolve()
    path = (base / name).resolve()
    if not path.is_relative_to(base) or not path.is_file():
        raise ValueError(f"Managed view artifact is missing or outside the report directory: {name}")
    return path


def _report_views(report_path: Path, report: Mapping[str, Any]) -> list[dict[str, Any]]:
    views: list[dict[str, Any]] = []
    for view_index, original in enumerate(report.get("views", [])):
        view = _as_mapping(original, f"report.views[{view_index}]")
        rendered = dict(view)
        if isinstance(view.get("svg"), str):
            rendered["svg"] = view["svg"]
        elif "file" in view:
            rendered["svg"] = _safe_artifact(report_path, view["file"]).read_text(encoding="utf-8")
        else:
            rendered["svg"] = None
        rendered["label"] = view.get("label", view.get("id", "Managed view"))
        targets = view.get("targets", [])
        rendered["scope"] = ", ".join(targets) if isinstance(targets, list) else targets
        rendered["limits"] = list(view.get("limits", [])) if isinstance(view.get("limits"), list) else []
        if view.get("excluded"):
            rendered["limits"].extend(item.get("reason", item) if isinstance(item, Mapping) else item for item in view["excluded"])
        views.append(rendered)
    return views


def build_review_state(report_path: Path, source: Path, profile_path: Path, baseline_report_path: Path, baseline_source: Path) -> dict[str, Any]:
    """Build render state from exact managed inputs without writing any input."""

    report_path, source, profile_path, baseline_report_path, baseline_source = (Path(path).resolve() for path in (report_path, source, profile_path, baseline_report_path, baseline_source))
    baseline_raw = baseline_source.read_bytes()
    profile = _as_mapping(json.loads(profile_path.read_text(encoding="utf-8")), "profile")
    report = load_report(report_path, source=source)
    baseline_report = load_report(baseline_report_path, source=baseline_source)
    for label, managed in (("current", report), ("baseline", baseline_report)):
        if managed.get("staticChecksPassed") is not True:
            raise ValueError(f"Contributor export requires a statically valid {label} managed report")
        if not managed.get("sourceSha256"):
            raise ValueError(f"{label.capitalize()} managed report has no source identity")
    baseline_digest = sha256(baseline_raw)
    declared_baseline = profile.get("baselineSourceSha256", profile.get("baselineSha256"))
    if declared_baseline not in (None, baseline_digest):
        raise ValueError("Supplied baseline source does not match the profile baseline SHA-256")
    rows, changes = _hydrate_rows(profile, report)
    evidence = _bind_evidence(profile, baseline_report, report, baseline_digest)
    changes = _attach_changes(changes, baseline_report)
    limits = list(_as_list(profile.get("limits", []), "profile.limits"))
    limits += [
        "This reference export is an offline oracle over managed report evidence; the product report-engine remains the export authority.",
        "Candidate acceptance, project approval, verification execution and physical performance are not recorded here.",
    ]
    state = {
        "title": profile.get("title", "Contributor review"),
        "revision": report["sourceSha256"],
        "sourceSha256": report["sourceSha256"],
        "profile": profile.get("profile", "local-contributor-v1"),
        "rows": rows,
        "evidence": evidence,
        "unresolved": copy.deepcopy(_as_list(profile.get("unresolved", []), "profile.unresolved")),
        "review": {
            "summary": "Reference fixture review only. Candidate acceptance is not recorded.",
            "changes": changes,
            "diff": f"Baseline source SHA-256: {baseline_digest}\nCurrent source SHA-256: {report['sourceSha256']}\nField-level comparison only; candidate acceptance is not recorded.",
        },
        "views": _report_views(report_path, report),
        "limits": limits,
        "baselineSourceSha256": baseline_digest,
    }
    if sha256(baseline_source.read_bytes()) != baseline_digest:
        raise ValueError("Baseline source changed while exporting")
    return state


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", type=Path, required=True, help="Managed qualification report.json")
    parser.add_argument("--source", type=Path, required=True, help="Exact source bound to the managed report")
    parser.add_argument("--profile", type=Path, required=True, help="Contributor profile JSON manifest")
    parser.add_argument("--baseline-report", type=Path, required=True, help="Managed qualification report for the frozen baseline")
    parser.add_argument("--baseline-source", type=Path, required=True, help="Frozen baseline source for historical evidence binding")
    parser.add_argument("--output", type=Path, required=True, help="New HTML output path")
    args = parser.parse_args(argv)
    output = args.output.resolve()
    if output.exists():
        raise ValueError("Refusing to overwrite an existing contributor export")
    if not output.parent.is_dir():
        raise ValueError("Contributor export output directory does not exist")
    state = build_review_state(args.report, args.source, args.profile, args.baseline_report, args.baseline_source)
    output.write_text(render_review(state), encoding="utf-8", newline="\n")
    print(json.dumps({"output": str(output), "sourceSha256": state["sourceSha256"],
                      "baselineSourceSha256": state["baselineSourceSha256"],
                      "candidateAcceptance": "not-recorded"}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
