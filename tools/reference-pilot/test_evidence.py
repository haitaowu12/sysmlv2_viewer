"""Adversarial evidence tests independent of the cooler fixture and its generator."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
from check_evidence import check_evidence, digest


class EvidenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.model = 'part pump;'
        (self.base / 'model.sysml').write_text(self.model)
        (self.base / 'input.txt').write_text('The system has a pump.\nUnknown pressure.\n')
        self.report = {'staticChecksPassed': True, 'sourceSha256': digest(self.model.encode()),
                       'elements': [{'sessionElementId': 'p1', 'metaclass': 'PartUsage',
                                     'qualifiedName': 'pump', 'line': 1, 'source': self.model}]}
        self.ledger = {'schemaVersion': 1, 'coverageProfile': 'source-declarations-v1',
                       'model': {'path': 'model.sysml', 'sha256': self.report['sourceSha256']},
                       'sources': [{'id': 'S1', 'path': 'input.txt',
                                    'sha256': digest((self.base/'input.txt').read_bytes())}],
                       'claims': [{'id': 'pump', 'status': 'source-backed', 'interpretation': 'Pump part.',
                                   'citations': [{'source': 'S1', 'startLine': 1, 'endLine': 1,
                                                 'quote': 'The system has a pump.'}],
                                   'targets': [{'select': {'metaclass': 'PartUsage', 'qualifiedName': 'pump'},
                                                'sourceSha256': digest(self.model.encode())}]}]}

        self.intake = {'schemaVersion': 1, 'sources': copy.deepcopy(self.ledger['sources'])}

    def check(self):
        return check_evidence(self.report, self.ledger, self.base, self.intake)

    def codes(self):
        result = self.check()
        self.assertFalse(result['passed'])
        return {f['code'] for f in result['findings']}

    def test_rewriting_source_and_ledger_does_not_change_intake_authority(self):
        (self.base/'input.txt').write_text('The system owns a fabricated pump.\n')
        self.ledger['sources'][0]['sha256'] = digest((self.base/'input.txt').read_bytes())
        self.ledger['claims'][0]['citations'][0]['quote'] = 'The system owns a fabricated pump.'
        self.assertIn('intake-source-mismatch', self.codes())

    def test_valid_and_open_unmodeled_question(self):
        self.ledger['claims'].append({'id': 'pressure', 'status': 'unresolved',
                                     'interpretation': 'Pressure not supplied.', 'targets': []})
        self.assertTrue(self.check()['passed'])

    def test_stale_input_even_if_original_quote_remains(self):
        with (self.base/'input.txt').open('a') as f:
            f.write('Correction: remove the pump.\n')
        self.assertIn('source-revision-mismatch', self.codes())

    def test_fabricated_quote_and_invalid_anchor(self):
        citation = self.ledger['claims'][0]['citations'][0]
        citation['quote'] = 'The pump is verified safe.'
        self.assertIn('quotation-mismatch', self.codes())
        citation['startLine'] = True
        self.assertIn('invalid-citation-anchor', self.codes())

    def test_unresolvable_citation_and_selector(self):
        self.ledger['claims'][0]['citations'][0]['source'] = 'invented'
        self.ledger['claims'][0]['targets'][0]['select']['qualifiedName'] = 'missing'
        self.assertTrue({'invalid-citation-anchor', 'target-not-unique'} <= self.codes())

    def test_duplicate_claim_ids_are_rejected(self):
        self.ledger['claims'].append(copy.deepcopy(self.ledger['claims'][0]))
        with self.assertRaises(ValueError):
            self.check()

    def test_assumption_and_conflict_cannot_be_accepted(self):
        for status in ('assumption', 'unresolved', 'conflict'):
            with self.subTest(status=status):
                self.ledger['claims'][0]['status'] = status
                self.assertIn('provisional-modeled-claims', self.codes())

    def test_new_uncited_part_and_flow_are_not_covered_by_package(self):
        for kind in ('PartUsage', 'FlowUsage', 'NewLanguageUsage'):
            with self.subTest(kind=kind):
                extra = {'sessionElementId': 'extra', 'metaclass': kind, 'line': 2,
                         'source': 'flow from pump to tank;', 'qualifiedName': 'extra'}
                self.report['elements'].append(extra)
                self.assertIn('uncovered-declarations', self.codes())
                self.report['elements'].pop()

    def test_model_report_and_target_revisions(self):
        self.report['sourceSha256'] = 'wrong'
        self.assertIn('model-revision-mismatch', self.codes())
        self.report['sourceSha256'] = self.ledger['model']['sha256']
        self.report['elements'][0]['source'] = 'ref part pump;'
        self.assertIn('target-source-changed', self.codes())

    def test_string_failure_and_boolean_schema_cannot_pass(self):
        self.report['staticChecksPassed'] = 'false'
        self.assertIn('static-checks-failed', self.codes())
        self.ledger['schemaVersion'] = True
        with self.assertRaises(ValueError):
            self.check()

    def test_failed_engine_and_empty_claims(self):
        self.report['staticChecksPassed'] = False
        self.assertIn('static-checks-failed', self.codes())
        self.ledger['claims'] = []
        with self.assertRaises(ValueError):
            self.check()

    def test_paths_cannot_escape_through_parent_or_symlink(self):
        for path in ('../input.txt', '/etc/hosts'):
            self.ledger['sources'][0]['path'] = path
            with self.assertRaises(ValueError):
                self.check()
        (self.base/'escape').symlink_to('/etc/hosts')
        self.ledger['sources'][0]['path'] = 'escape'
        with self.assertRaises(ValueError):
            self.check()

    def test_existing_cooler_contracts_have_explicit_source_hashes(self):
        root = Path(__file__).resolve().parents[2]/'fixtures/authoring/cooler'
        for kind in ('architecture', 'interfaces', 'conversation'):
            ledger = json.loads((root/kind/'evidence-contract.json').read_text())
            self.assertEqual(ledger['model']['sha256'], digest((root/kind/'model.sysml').read_bytes()))
            self.assertTrue(all(t.get('sourceSha256') for c in ledger['claims'] for t in c['targets']))


if __name__ == '__main__':
    unittest.main()
