"""Focused checks for the managed, reference-side contributor export CLI."""

from __future__ import annotations

import copy
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import contributor_export_cli


def _sha(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


class ContributorExportCliTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.baseline = self.root / "baseline.sysml"
        self.source = self.root / "candidate.sysml"
        self.baseline_report_path = self.root / "baseline-report.json"
        self.report_path = self.root / "candidate-report.json"
        self.baseline.write_text(
            """package P {
attribute limit = 120;
requirement responseWithinBound {
  doc /* The controller shall respond within 120 ms of request receipt. */
}
// HIST-A-01: Baseline A recorded 95 ms at field A.
}
""",
            encoding="utf-8",
        )
        self.source.write_text(
            """package P {
attribute limit = 80;
requirement responseWithinBound {
  doc /* The controller shall respond within 80 ms of request receipt. */
}
// HIST-A-01: Baseline A recorded 95 ms at field A.
}
""",
            encoding="utf-8",
        )
        self.profile_path = self.root / "contributor.json"
        self.profile_path.write_text(
            json.dumps(
                {
                    "schemaVersion": 1,
                    "profile": "local-contributor-v1",
                    "title": "Fixture contributor review",
                    "rows": [
                        {
                            "id": "RQ-1",
                            "label": "Response requirement",
                            "kind": "requirement",
                            "target": "P::responseWithinBound",
                            "fields": [
                                {"id": "limit", "label": "Response limit", "kind": "decimal", "target": "P::limit", "unit": "ms", "minimum": 0},
                                {"id": "statement", "label": "Requirement statement", "kind": "text", "target": "P::responseWithinBound"},
                            ],
                        },
                        {
                            "id": "IF-1",
                            "label": "Field interface",
                            "kind": "interface",
                            "target": "P::fieldExchange",
                            "fields": [
                                {"id": "field", "label": "Field identity", "kind": "reference", "target": "P::fieldA", "editable": True, "options": ["P::fieldA"]}
                            ],
                        },
                    ],
                    "evidence": [
                        {"id": "HIST-A-01", "label": "Baseline observation", "observedValue": 95, "unit": "ms", "target": "P::historical", "sourceRevision": "initial", "status": "historical-observation", "explanation": "Retained for applicability review."}
                    ],
                    "unresolved": [{"id": "OPEN-1", "question": "Which acknowledgement meaning applies?", "status": "open"}],
                    "limits": ["Fixture only; no physical verification."],
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        documentation = {
            "sessionElementId": "doc",
            "metaclass": "Documentation",
            "qualifiedName": "P::responseWithinBound::doc",
            "semantics": {"documentedElement": {"id": "requirement"}, "owner": {"id": "requirement"}, "body": "The controller shall respond within 80 ms of request receipt."},
        }
        self.report = {
            "staticChecksPassed": True,
            "sourceSha256": _sha(self.source.read_bytes()),
            "elements": [
                {"sessionElementId": "requirement", "qualifiedName": "P::responseWithinBound", "metaclass": "RequirementDefinition", "semantics": {"documentation": [{"id": "doc"}]}},
                documentation,
                {"sessionElementId": "limit", "qualifiedName": "P::limit", "metaclass": "AttributeUsage", "source": "attribute limit = 80;", "semantics": {"ownedElement": [{"id": "literal"}]}},
                {"sessionElementId": "literal", "qualifiedName": "P::limit::literal", "metaclass": "LiteralReal", "semantics": {"value": 80}},
                {"sessionElementId": "historical", "qualifiedName": "P::historical", "metaclass": "AttributeUsage", "source": "attribute historical = 95;", "semantics": {"ownedElement": [{"id": "historical-literal"}]}},
                {"sessionElementId": "historical-literal", "qualifiedName": "P::historical::literal", "metaclass": "LiteralReal", "semantics": {"value": 95}},
                {"sessionElementId": "field-exchange", "qualifiedName": "P::fieldExchange", "metaclass": "InterfaceUsage", "semantics": {}},
                {"sessionElementId": "field-a", "qualifiedName": "P::fieldA", "metaclass": "PartUsage", "semantics": {}},
            ],
            "views": [],
        }
        self.baseline_report = copy.deepcopy(self.report)
        self.baseline_report["sourceSha256"] = _sha(self.baseline.read_bytes())
        for element in self.baseline_report["elements"]:
            if element.get("qualifiedName") == "P::limit":
                element["source"] = "attribute limit = 120;"
            if element.get("sessionElementId") == "literal":
                element["semantics"]["value"] = 120
            if element.get("sessionElementId") == "doc":
                element["semantics"]["body"] = "The controller shall respond within 120 ms of request receipt."
        self.report_path.write_text("managed candidate report", encoding="utf-8")
        self.baseline_report_path.write_text("managed baseline report", encoding="utf-8")

    def _build(self) -> dict:
        def load(path, *, source):
            return copy.deepcopy(self.baseline_report if Path(path).name == self.baseline_report_path.name else self.report)

        with patch.object(contributor_export_cli, "load_report", side_effect=load) as loader:
            state = contributor_export_cli.build_review_state(self.report_path, self.source, self.profile_path, self.baseline_report_path, self.baseline)
        self.assertEqual(loader.call_count, 2)
        return state

    def test_build_binds_exact_report_values_and_baseline_evidence(self) -> None:
        state = self._build()

        requirement = state["rows"][0]
        self.assertEqual(requirement["fields"][0]["value"], 80)
        self.assertIn("within 80 ms", requirement["fields"][1]["value"])
        self.assertEqual(state["rows"][1]["fields"][0]["value"], "P::fieldA")
        self.assertFalse(state["rows"][1]["fields"][0]["editable"])
        self.assertEqual(state["evidence"][0]["sourceRevision"], _sha(self.baseline.read_bytes()))
        self.assertEqual(len(state["review"]["changes"]), 2)
        self.assertEqual(state["review"]["changes"][0]["before"], 120)
        self.assertIn("candidate acceptance is not recorded", state["review"]["summary"].lower())
        self.assertEqual(state["baselineSourceSha256"], _sha(self.baseline.read_bytes()))

    def test_main_writes_new_html_only_and_refuses_overwrite(self) -> None:
        output = self.root / "review.html"
        def load(path, *, source):
            return copy.deepcopy(self.baseline_report if Path(path).name == self.baseline_report_path.name else self.report)

        with patch.object(contributor_export_cli, "load_report", side_effect=load):
            self.assertEqual(
                contributor_export_cli.main(
                    [
                        "--report", str(self.report_path),
                        "--source", str(self.source),
                        "--profile", str(self.profile_path),
                        "--baseline-report", str(self.baseline_report_path),
                        "--baseline-source", str(self.baseline),
                        "--output", str(output),
                    ]
                ),
                0,
            )
        html = output.read_text(encoding="utf-8")
        self.assertIn("Fixture contributor review", html)
        self.assertIn("80", html)
        self.assertIn("candidate acceptance is not recorded", html.lower())
        with patch.object(contributor_export_cli, "load_report", side_effect=load), self.assertRaisesRegex(ValueError, "overwrite"):
            contributor_export_cli.main(
                [
                    "--report", str(self.report_path),
                    "--source", str(self.source),
                    "--profile", str(self.profile_path),
                    "--baseline-report", str(self.baseline_report_path),
                    "--baseline-source", str(self.baseline),
                    "--output", str(output),
                ]
            )

    def test_changed_historical_current_literal_fails_closed(self) -> None:
        for element in self.report["elements"]:
            if element.get("sessionElementId") == "historical-literal":
                element["semantics"]["value"] = 94
        with self.assertRaisesRegex(ValueError, "differs from its current managed report fact"):
            self._build()

    def test_changed_historical_baseline_literal_fails_closed(self) -> None:
        for element in self.baseline_report["elements"]:
            if element.get("sessionElementId") == "historical-literal":
                element["semantics"]["value"] = 94
        with self.assertRaisesRegex(ValueError, "differs from its baseline managed report fact"):
            self._build()

    def test_duplicate_local_names_use_the_exact_qualified_target(self) -> None:
        profile = json.loads(self.profile_path.read_text(encoding="utf-8"))
        profile["rows"][0]["fields"][0]["target"] = "P::B::limit"
        self.profile_path.write_text(json.dumps(profile), encoding="utf-8")
        for report, value in ((self.report, 80), (self.baseline_report, 120)):
            report["elements"].extend([
                {"sessionElementId": "limit-a", "qualifiedName": "P::A::limit", "metaclass": "AttributeUsage", "semantics": {"ownedElement": [{"id": "literal-a"}]}},
                {"sessionElementId": "literal-a", "qualifiedName": "P::A::limit::literal", "metaclass": "LiteralReal", "semantics": {"value": 999}},
                {"sessionElementId": "limit-b", "qualifiedName": "P::B::limit", "metaclass": "AttributeUsage", "semantics": {"ownedElement": [{"id": "literal-b"}]}},
                {"sessionElementId": "literal-b", "qualifiedName": "P::B::limit::literal", "metaclass": "LiteralReal", "semantics": {"value": value}},
            ])
        state = self._build()
        self.assertEqual(state["rows"][0]["fields"][0]["value"], 80)
        self.assertEqual(state["review"]["changes"][0]["before"], 120)

    def test_manifest_status_cannot_create_an_acceptance_claim(self) -> None:
        profile = json.loads(self.profile_path.read_text(encoding="utf-8"))
        profile["status"] = "accepted-after-review"
        self.profile_path.write_text(json.dumps(profile), encoding="utf-8")
        state = self._build()
        self.assertIn("candidate acceptance is not recorded", state["review"]["summary"].lower())


if __name__ == "__main__":
    unittest.main()
