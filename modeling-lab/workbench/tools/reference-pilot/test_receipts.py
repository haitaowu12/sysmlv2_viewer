import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import subprocess
from receipts import bind_receipt, sha
from run_reference import run_reference
from report_integrity import load_report


class ReceiptTests(unittest.TestCase):
    def test_artifact_and_implementation_binding(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            for name in ('report', 'contract', 'evidence', 'intake'):
                (root/name).write_text('{}')
            r = bind_receipt({'passed': True}, root/'report', contract=root/'contract', evidence=root/'evidence', intake=root/'intake')
            for name in ('report', 'contract', 'evidence', 'intake'):
                self.assertEqual(r[name+'Sha256'], sha(root/name))
            self.assertIn('ReferencePilot.java', r['implementationSha256'])
            (root/'contract').write_text('{"changed": true}')
            self.assertNotEqual(r['contractSha256'], bind_receipt({},root/'report',contract=root/'contract')['contractSha256'])


    def test_receipt_rejects_changed_consumed_report_or_contract(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d); report = root/'report.json'; contract = root/'contract.json'
            report.write_text('{}'); contract.write_text('{}')
            consumed = load_report(report, require_managed=False)
            contract_hash = sha(contract)
            report.write_text('{"different": true}')
            with self.assertRaisesRegex(ValueError, 'Report changed'):
                bind_receipt({'passed': True}, report, report_data=consumed)
            consumed = load_report(report, require_managed=False)
            contract.write_text('{"changed": true}')
            with self.assertRaisesRegex(ValueError, 'Assessment input changed'):
                bind_receipt({}, report, report_data=consumed, contract=contract, input_digests={'contract': contract_hash})

    def test_unmanaged_subprocess_report_cannot_become_successful_qualification(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d); report = root/'report.json'
            report.write_text(json.dumps({'staticChecksPassed': True, 'elements': [], 'views': [], 'diagnostics': []}))
            with patch('run_reference.subprocess.run', return_value=subprocess.CompletedProcess(['java'], 0)):
                code, result = run_reference(['java'], root/'run.log', report)
            self.assertEqual(code, 2)
            self.assertIn('integrity receipt', result['failure']['message'])

    def test_timeout_missing_and_malformed_reports_have_failure_receipts(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            for case in ('timeout', 'missing', 'malformed'):
                report = root/case/'report.json'
                report.parent.mkdir()
                if case == 'malformed':
                    report.write_text('{broken')
                effect = subprocess.TimeoutExpired(['java'], 1) if case == 'timeout' else None
                with patch('run_reference.subprocess.run', side_effect=effect,
                           return_value=subprocess.CompletedProcess(['java'], 0)):
                    code, result = run_reference(['java'], root/(case+'.log'), report, 1)
                self.assertEqual(code, 2)
                self.assertFalse(result['staticChecksPassed'])
                self.assertTrue((report.parent/'failure.json').is_file())


if __name__ == '__main__':
    unittest.main()
