import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import subprocess
from receipts import bind_receipt, sha
from run_reference import run_reference


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
