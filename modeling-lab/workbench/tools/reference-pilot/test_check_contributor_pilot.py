import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from check_contributor_pilot import compare_reports, verify_paths


FIXTURE = Path(__file__).resolve().parents[2] / "fixtures" / "contributor-pilot"
EXPECTED_PATH = FIXTURE / "expected-facts.json"


def _ref(element):
    return {
        "id": element["sessionElementId"],
        "qualifiedName": element["qualifiedName"],
        "name": element.get("name"),
        "metaclass": element["metaclass"],
    }


def _element(identity, qualified_name, metaclass, name=None, source="", **semantics):
    return {
        "sessionElementId": identity,
        "qualifiedName": qualified_name,
        "name": name if name is not None else qualified_name.split("::")[-1],
        "metaclass": metaclass,
        "source": source,
        "semantics": semantics,
    }


def _report(source_path, revision, response_value):
    expected = json.loads(EXPECTED_PATH.read_text(encoding="utf-8"))
    requirement_text = (
        f"the controller shall return a control acknowledgement within {response_value} ms of request receipt. "
        "ACK-MEANING-01 is OPEN: acknowledgement may mean an accepted dispatch message or a completed field action."
    )
    literal_response = _element(
        f"response-literal-{revision}",
        f"ContributorPilot::ControlController::responseLimitMs::literal-{revision}",
        "LiteralReal",
        value=response_value,
    )
    response = _element(
        f"response-{revision}",
        "ContributorPilot::ControlController::responseLimitMs",
        "AttributeUsage",
        ownedElement=[_ref(literal_response)],
    )
    literal_historical = _element(
        f"historical-literal-{revision}",
        f"ContributorPilot::ControlController::historicalObservedResponseMillisecondsAtA::literal-{revision}",
        "LiteralReal",
        value=95,
    )
    historical = _element(
        f"historical-{revision}",
        "ContributorPilot::ControlController::historicalObservedResponseMillisecondsAtA",
        "AttributeUsage",
        ownedElement=[_ref(literal_historical)],
    )
    controller = _element("controller-def", "ContributorPilot::ControlController", "PartDefinition")
    doc = _element(
        f"requirement-doc-{revision}",
        f"ContributorPilot::responseWithinBound::doc-{revision}",
        "Documentation",
        body=requirement_text,
        documentedElement={"id": f"requirement-{revision}"},
        owner={"id": f"requirement-{revision}"},
    )
    requirement = _element(
        f"requirement-{revision}",
        "ContributorPilot::responseWithinBound",
        "RequirementUsage",
        documentation=[_ref(doc)],
        subjectParameter={
            "id": f"subject-{revision}",
            "qualifiedName": f"ContributorPilot::responseWithinBound::controller",
            "name": "controller",
            "metaclass": "ReferenceUsage",
        },
    )
    subject_usage = _element(
        f"subject-{revision}",
        "ContributorPilot::responseWithinBound::controller",
        "ReferenceUsage",
        owner={"id": f"requirement-{revision}"},
        type=[_ref(controller)],
    )
    verification_doc = _element(
        f"verification-doc-{revision}",
        f"ContributorPilot::AcknowledgementTimingCheck::doc-{revision}",
        "Documentation",
        body="Planned verification only. No procedure, instrumentation, calibration applicability, execution or acceptance is supplied.",
        documentedElement={"id": f"verification-{revision}"},
        owner={"id": f"verification-{revision}"},
    )
    verification = _element(
        f"verification-{revision}",
        "ContributorPilot::AcknowledgementTimingCheck",
        "VerificationCaseDefinition",
        documentation=[_ref(verification_doc)],
        verifiedRequirement=[_ref(requirement)],
    )
    interface = _element(
        f"interface-{revision}",
        "ContributorPilot::ControllerFieldExchange",
        "InterfaceDefinition",
    )
    advanced = _element(
        f"advanced-{revision}",
        "ContributorPilot::UnrelatedAdvancedLifecycle",
        "StateDefinition",
        source=(
            "doc /* UNRELATED-ADVANCED-01: Preserve this advanced state declaration and its comment. */ "
            "state idle; state active; transition begin first idle then active;"
        ),
    )
    root = _element("system", "ContributorPilot::InfrastructureControlSystem", "PartDefinition")
    endpoint_elements = [
        _element("controller", "ContributorPilot::InfrastructureControlSystem::controller", "PartUsage", "controller"),
        _element("fieldA", "ContributorPilot::InfrastructureControlSystem::fieldA", "PartUsage", "fieldA"),
        _element("fieldB", "ContributorPilot::InfrastructureControlSystem::fieldB", "PartUsage", "fieldB"),
        _element("controllerA", "ContributorPilot::InfrastructureControlSystem::controller::fieldALink", "PortUsage", "fieldALink"),
        _element("controllerB", "ContributorPilot::InfrastructureControlSystem::controller::fieldBLink", "PortUsage", "fieldBLink"),
        _element("fieldAPort", "ContributorPilot::InfrastructureControlSystem::fieldA::control", "PortUsage", "control"),
        _element("fieldBPort", "ContributorPilot::InfrastructureControlSystem::fieldB::control", "PortUsage", "control"),
    ]
    elements = [
        response,
        literal_response,
        historical,
        literal_historical,
        controller,
        doc,
        requirement,
        subject_usage,
        verification,
        verification_doc,
        interface,
        advanced,
        root,
        *endpoint_elements,
    ]
    return {
        "sourceSha256": expected["models"]["baselineA" if revision == "A" else "candidateB"]["sha256"],
        "staticChecksPassed": True,
        "reportIntegrity": {"status": "verified-managed"},
        "elements": elements,
        "revision": revision,
        "source": str(source_path),
    }


def _projection(*_args, **_kwargs):
    return {
        "flows": [
            {"source": ["controller", "controllerA"], "target": ["fieldA", "fieldAPort"], "item": "ControlRequest"},
            {"source": ["fieldA", "fieldAPort"], "target": ["controller", "controllerA"], "item": "ControlAcknowledgement"},
            {"source": ["controller", "controllerB"], "target": ["fieldB", "fieldBPort"], "item": "ControlRequest"},
            {"source": ["fieldB", "fieldBPort"], "target": ["controller", "controllerB"], "item": "ControlAcknowledgement"},
        ],
        "connectors": [{"elementId": "fieldAExchange"}, {"elementId": "fieldBExchange"}],
        "excluded": [],
    }


class ContributorPilotCheckerTests(unittest.TestCase):
    def setUp(self):
        self.expected = json.loads(EXPECTED_PATH.read_text(encoding="utf-8"))
        self.baseline = _report(FIXTURE / "model.sysml", "A", 120)
        self.candidate = _report(FIXTURE / "candidate-model.sysml", "B", 80)

    def compare(self, baseline=None, candidate=None, expected=None):
        with patch("check_contributor_pilot.interconnection", side_effect=_projection):
            return compare_reports(
                baseline or self.baseline,
                FIXTURE / "model.sysml",
                candidate or self.candidate,
                FIXTURE / "candidate-model.sysml",
                expected or self.expected,
            )

    def test_independent_facts_pass_and_return_counts_and_results(self):
        result = self.compare()
        self.assertTrue(result["passed"], result)
        self.assertGreater(result["checkCount"], 10)
        self.assertEqual(result["failedCount"], 0)
        self.assertEqual(len(result["results"]), result["checkCount"])

    def test_missing_verification_fails_for_either_revision(self):
        for revision in ("baseline", "candidate"):
            with self.subTest(revision=revision):
                report = copy.deepcopy(getattr(self, revision))
                report["elements"] = [e for e in report["elements"] if e["qualifiedName"] != "ContributorPilot::AcknowledgementTimingCheck"]
                self.assertFalse(self.compare(**{revision: report})["passed"])

    def test_wrong_verification_metaclass_fails(self):
        report = copy.deepcopy(self.candidate)
        verification = next(e for e in report["elements"] if e["qualifiedName"] == "ContributorPilot::AcknowledgementTimingCheck")
        verification["metaclass"] = "PartDefinition"
        self.assertFalse(self.compare(candidate=report)["passed"])

    def test_wrong_or_unresolved_verified_requirement_fails(self):
        for reference in ({"id": "advanced-B"}, {"id": "missing", "qualifiedName": "ContributorPilot::responseWithinBound"}):
            with self.subTest(reference=reference):
                report = copy.deepcopy(self.candidate)
                verification = next(e for e in report["elements"] if e["qualifiedName"] == "ContributorPilot::AcknowledgementTimingCheck")
                verification["semantics"]["verifiedRequirement"] = [reference]
                self.assertFalse(self.compare(candidate=report)["passed"])

    def test_executed_or_missing_verification_documentation_fails(self):
        for body in ("Executed verification passed.", ""):
            with self.subTest(body=body):
                report = copy.deepcopy(self.candidate)
                doc = next(e for e in report["elements"] if e["sessionElementId"] == "verification-doc-B")
                doc["semantics"]["body"] = body
                self.assertFalse(self.compare(candidate=report)["passed"])

    def test_missing_or_executed_verification_expectation_fails(self):
        for verification in (None, {"status": "executed"}):
            with self.subTest(verification=verification):
                expected = copy.deepcopy(self.expected)
                expected["models"]["candidateB"]["verification"] = verification
                self.assertFalse(self.compare(expected=expected)["passed"])

    def test_wrong_expected_response_value_fails_exact_literal_check(self):
        expected = copy.deepcopy(self.expected)
        expected["models"]["baselineA"]["responseProvision"]["literalValue"] = 121
        result = self.compare(expected=expected)
        self.assertFalse(result["passed"])
        failed_ids = {entry["id"] for entry in result["results"] if not entry["passed"]}
        self.assertIn("baselinea.response-provision", failed_ids)

    def test_changed_historical_observation_fails_candidate_check(self):
        candidate = copy.deepcopy(self.candidate)
        history = next(
            element
            for element in candidate["elements"]
            if element.get("qualifiedName")
            == "ContributorPilot::ControlController::historicalObservedResponseMillisecondsAtA"
        )
        literal_id = history["semantics"]["ownedElement"][0]["id"]
        literal = next(element for element in candidate["elements"] if element["sessionElementId"] == literal_id)
        literal["semantics"]["value"] = 96
        result = self.compare(candidate=candidate)
        self.assertFalse(result["passed"])
        failed_ids = {entry["id"] for entry in result["results"] if not entry["passed"]}
        self.assertIn("candidateb.historical-observation", failed_ids)

    def test_wrong_requirement_subject_type_fails_type_chain_check(self):
        candidate = copy.deepcopy(self.candidate)
        requirement = next(
            element
            for element in candidate["elements"]
            if element.get("qualifiedName") == "ContributorPilot::responseWithinBound"
        )
        subject_id = requirement["semantics"]["subjectParameter"]["id"]
        subject = next(element for element in candidate["elements"] if element["sessionElementId"] == subject_id)
        subject["semantics"]["type"] = [
            {
                "qualifiedName": "ContributorPilot::WrongController",
                "name": "WrongController",
                "metaclass": "PartDefinition",
            }
        ]
        result = self.compare(candidate=candidate)
        self.assertFalse(result["passed"])
        failed_ids = {entry["id"] for entry in result["results"] if not entry["passed"]}
        self.assertIn("candidateb.requirement-classification-and-subject", failed_ids)

    def test_unqualified_report_is_rejected_before_semantic_comparison(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            baseline_source = root / "model.sysml"
            candidate_source = root / "candidate-model.sysml"
            baseline_source.write_bytes((FIXTURE / "model.sysml").read_bytes())
            candidate_source.write_bytes((FIXTURE / "candidate-model.sysml").read_bytes())
            baseline_report = root / "baseline-report.json"
            candidate_report = root / "candidate-report.json"
            baseline_report.write_text(json.dumps({"sourceSha256": self.expected["models"]["baselineA"]["sha256"]}))
            candidate_report.write_text(json.dumps({"sourceSha256": self.expected["models"]["candidateB"]["sha256"]}))
            result = verify_paths(
                baseline_report,
                baseline_source,
                candidate_report,
                candidate_source,
                EXPECTED_PATH,
            )
        self.assertFalse(result["passed"])
        failed_ids = {entry["id"] for entry in result["results"] if not entry["passed"]}
        self.assertEqual(
            failed_ids,
            {"baselinea.managed-report-source-binding", "candidateb.managed-report-source-binding"},
        )


if __name__ == "__main__":
    unittest.main()
