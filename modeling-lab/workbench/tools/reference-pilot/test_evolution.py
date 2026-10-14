"""Local state transition tests; fixture sealing does not simulate engine validity."""
import copy
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch

from evolution import PLAN_FIELDS, create_transaction, impact, load_transaction, planning, promote, sha
from report_integrity import seal_report


class EvolutionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name)
        self.original = b'package Sorter { attribute limit = 20; }\n'
        self.candidate_raw = b'package Sorter { attribute limit = 10; }\n'
        for name, raw in {'old.txt': b'Acknowledgement within 20 ms.\n',
                          'new.txt': b'Acknowledgement within 10 ms.\n',
                          'baseline.sysml': self.original,
                          'observation.json': b'{"configuration":"old","value":18,"unit":"ms","result":"pass"}\n'}.items():
            (self.base / name).write_bytes(raw)
        def revision(name, label):
            return {'path': name, 'sha256': sha((self.base / name).read_bytes()), 'revision': label,
                    'anchors': [{'id': 'ack', 'startLine': 1, 'endLine': 1,
                                 'quote': (self.base / name).read_text().strip()}]}
        nodes = [{'id': 'ack', 'kind': 'source-anchor'},
                 {'id': 'requirement', 'kind': 'model-selector', 'selector': 'Sorter::limit'},
                 *[{'id': name, 'kind': kind} for name, kind in (
                     ('view', 'view'), ('procedure', 'procedure'), ('decision', 'decision'),
                     ('supplier', 'artifact'), ('historical', 'observation'), ('unlinked', 'artifact'))]]
        link = lambda lid, source, target: {'id': lid, 'from': source, 'to': target, 'reason': 'Explicit local dependency'}
        links = [link('a', 'ack', 'requirement'), link('b', 'requirement', 'view'),
                 link('c', 'requirement', 'procedure'), link('d', 'procedure', 'historical'),
                 link('e', 'requirement', 'decision'), link('f', 'decision', 'supplier')]
        self.manifest = {'schemaVersion': 1, 'id': 'change-icd-2', 'artifactId': 'icd',
                         'old': revision('old.txt', 'A'), 'new': revision('new.txt', 'B'),
                         'modelBaseline': {'path': 'baseline.sysml', 'sha256': sha(self.original)},
                         'changedAnchorIds': ['ack'], 'nodes': nodes, 'oldLinks': links, 'newLinks': links[:-1],
                         'inventory': [{'id': 'not-in-graph', 'kind': 'artifact'}],
                         'observations': [{'id': 'historical', 'path': 'observation.json',
                                           'sha256': sha((self.base / 'observation.json').read_bytes())}]}
        (self.base / 'manifest.json').write_text(json.dumps(self.manifest))
        self.transaction_path = self.base / 'transaction'
        self.transaction = create_transaction(self.base / 'manifest.json', self.transaction_path)
        self.candidate = self.base / 'candidate.sysml'; self.candidate.write_bytes(self.candidate_raw)
        self.report = self.managed_fixture('qualification', self.candidate_raw)
        self.disposition = {'schemaVersion': 1, 'action': 'promote', 'sourceChangeId': 'change-icd-2',
                            'transactionSha256': self.transaction['transactionSha256'],
                            'baseSourceSha256': sha(self.original), 'candidateSourceSha256': sha(self.candidate_raw),
                            'recordedBy': 'fixture local recorder', 'recordedAt': '2026-10-04',
                            'rationale': 'Retain open timing design assessment',
                            'retainedShortfalls': ['Delivered timing behavior is unverified.'],
                            'impacts': [{'nodeId': item['node']['id'], 'action': 'review', 'reason': 'Review changed applicability'}
                                        for item in self.transaction['impact']]}
        self.disposition_path = self.base / 'disposition.json'; self.save_disposition()

    def save_disposition(self):
        self.disposition_path.write_text(json.dumps(self.disposition))

    def managed_fixture(self, name, source):
        """Satisfy integrity seam for state tests; not a real qualification run."""
        directory = self.base / name; directory.mkdir()
        (directory / 'source.snapshot').write_bytes(source)
        (directory / 'producer.snapshot').write_bytes(b'fixture producer')
        implementation = {'fixture': {'file': 'producer.snapshot', 'sha256': sha(b'fixture producer')}}
        producer_digests = {'fixture': sha(b'fixture producer')}
        snapshots = {'source': {'file': 'source.snapshot', 'sha256': sha(source)}}
        inputs = {'sourceSha256': sha(source), 'producerImplementationSha256': producer_digests, 'snapshots': snapshots}
        report = {'staticChecksPassed': True, 'sourceSha256': sha(source),
                  'producerIntegrity': {'schemaVersion': 1, 'receiptFile': 'report-integrity.json'},
                  'producerImplementationSha256': producer_digests, 'elements': [{'qualifiedName': 'Sorter::limit'}]}
        report_path = directory / 'report.json'; report_path.write_text(json.dumps(report))
        inputs_path = directory / 'inputs.json'; inputs_path.write_text(json.dumps(inputs))
        seal_report(report_path, inputs_path, snapshots, implementation)
        return report_path

    def run_promote(self, output='promoted'):
        return promote(self.transaction_path, self.candidate, self.report, self.base / 'baseline.sysml',
                       self.disposition_path, self.base / output)

    def test_explicit_paths_removed_links_and_unknown_are_honest(self):
        impacts = {v['node']['id']: v for v in self.transaction['impact']}
        self.assertEqual(impacts['requirement']['classification'], 'direct')
        self.assertEqual(impacts['supplier']['classification'], 'possible')
        self.assertEqual(impacts['supplier']['witnessPaths'][0]['revision'], 'old')
        self.assertEqual(self.transaction['removedLinks'][0]['id'], 'f')
        self.assertEqual({v['node']['id'] for v in self.transaction['unknownImpact']}, {'unlinked', 'not-in-graph'})
        self.assertEqual(self.transaction['applicabilityAnnotations'][0]['status'], 'applicability-review-required')

    def test_artifact_quote_hash_and_baseline_mismatches_rejected(self):
        for mutate in (lambda m: m['new']['anchors'][0].update(quote='Invented'),
                       lambda m: m['old'].update(sha256='0' * 64),
                       lambda m: m['modelBaseline'].update(sha256='0' * 64),
                       lambda m: m.update(changedAnchorIds=['missing'])):
            with self.subTest(mutate=mutate):
                manifest = copy.deepcopy(self.manifest); mutate(manifest)
                with self.assertRaises(ValueError): impact(manifest, self.base)

    def test_transaction_and_snapshot_tampering_rejected(self):
        path = self.transaction_path / 'transaction.json'
        content = json.loads(path.read_text()); content['removedLinks'] = []
        path.write_text(json.dumps(content))
        with self.assertRaises(ValueError): load_transaction(self.transaction_path)
        path.write_text(json.dumps(self.transaction))
        (self.transaction_path / 'old-artifact.snapshot').write_text('tampered')
        with self.assertRaises(ValueError): load_transaction(self.transaction_path)

    def test_each_missing_planning_input_blocks_execution(self):
        complete = {'schemaVersion': 1, 'id': 'draft', **{key: 'Explicit supplied input' for key in PLAN_FIELDS},
                    'oracle': {'independenceRationale': 'Expectation supplied independently of modeled result',
                               'source': {'path': 'new.txt', 'sha256': self.manifest['new']['sha256'],
                                          'startLine': 1, 'endLine': 1, 'quote': 'Acknowledgement within 10 ms.'}},
                    'authorization': {'status': 'recorded-local', 'recordedBy': 'owner', 'recordedAt': '2026-10-04', 'scope': 'planning'}}
        self.assertEqual(planning(complete, self.base)['status'], 'planning-inputs-complete-draft')
        self.assertFalse(planning(complete, self.base)['executable'])
        for field in PLAN_FIELDS:
            with self.subTest(field=field):
                incomplete = {k: v for k, v in complete.items() if k != field}
                result = planning(incomplete, self.base)
                self.assertEqual(result['status'], 'blocked-nonexecutable-draft')
                self.assertIn(field, result['missingInputs']); self.assertFalse(result['executable'])
        complete['authorization'] = 'Assume approved'
        self.assertIn('authorization', planning(complete, self.base)['missingInputs'])
        complete['oracle']['source']['quote'] = 'Forged oracle'
        self.assertIn('oracle', planning(complete, self.base)['missingInputs'])

    def test_promote_retains_shortfall_and_original_observation(self):
        observation = (self.base / 'observation.json').read_bytes()
        receipt = self.run_promote()
        self.assertEqual((self.base / 'baseline.sysml').read_bytes(), self.candidate_raw)
        self.assertEqual((self.base / 'promoted/baseline-before.sysml').read_bytes(), self.original)
        self.assertEqual((self.base / 'observation.json').read_bytes(), observation)
        self.assertEqual((self.transaction_path / 'observation-0.snapshot').read_bytes(), observation)
        self.assertEqual(receipt['retainedShortfalls'], self.disposition['retainedShortfalls'])
        self.assertIn('not authenticated', receipt['boundary'])
        self.assertEqual(receipt['status'], 'promoted-local-baseline')

    def test_missing_stale_and_tampered_report_rejected(self):
        for name in ('report-integrity.json', 'report.json'):
            path = self.report.parent / name; raw = path.read_bytes()
            if name == 'report-integrity.json': path.unlink()
            else: path.write_text(path.read_text() + ' ')
            with self.assertRaises(ValueError): self.run_promote()
            path.write_bytes(raw)
        self.candidate.write_bytes(self.candidate_raw + b' ')
        with self.assertRaises(ValueError): self.run_promote()
        self.assertEqual((self.base / 'baseline.sysml').read_bytes(), self.original)

    def test_missing_disposition_and_stale_exact_bindings_rejected(self):
        original = copy.deepcopy(self.disposition)
        for key in ('candidateSourceSha256', 'baseSourceSha256', 'transactionSha256', 'sourceChangeId', 'recordedBy', 'retainedShortfalls', 'impacts'):
            with self.subTest(key=key):
                self.disposition = {k: v for k, v in original.items() if k != key}; self.save_disposition()
                with self.assertRaises(ValueError): self.run_promote()
        self.disposition = original; self.save_disposition()
        self.disposition_path.unlink()
        with self.assertRaises(FileNotFoundError): self.run_promote()
        self.assertEqual((self.base / 'baseline.sysml').read_bytes(), self.original)

    def test_changed_expected_base_cannot_be_overwritten(self):
        (self.base / 'baseline.sysml').write_bytes(b'Another writer changed the base')
        with self.assertRaises(ValueError): self.run_promote()
        self.assertEqual((self.base / 'baseline.sysml').read_bytes(), b'Another writer changed the base')
        self.assertFalse((self.base / 'promoted').exists())

    def test_unsupported_lock_platform_rejects_without_promotion(self):
        with patch('evolution.fcntl', None):
            with self.assertRaisesRegex(ValueError, 'POSIX fcntl'):
                self.run_promote()
        self.assertEqual((self.base / 'baseline.sysml').read_bytes(), self.original)
        self.assertFalse((self.base / 'promoted').exists())

    def test_competing_candidates_one_promotes_other_rejects(self):
        alternate_raw = b'package Sorter { attribute limit = 8; }\n'
        alternate = self.base / 'alternate.sysml'; alternate.write_bytes(alternate_raw)
        report = self.managed_fixture('alternate-qualification', alternate_raw)
        disposition = {**self.disposition, 'candidateSourceSha256': sha(alternate_raw)}
        disposition_path = self.base / 'alternate-disposition.json'; disposition_path.write_text(json.dumps(disposition))
        start = threading.Barrier(2); results = []
        def attempt(candidate, report, disposition_path, output):
            start.wait()
            try:
                receipt = promote(self.transaction_path, candidate, report, self.base / 'baseline.sysml', disposition_path, output)
                results.append(('success', receipt['candidateSourceSha256']))
            except ValueError as error:
                results.append(('rejected', str(error)))
        threads = [threading.Thread(target=attempt, args=(self.candidate, self.report, self.disposition_path, self.base / 'first')),
                   threading.Thread(target=attempt, args=(alternate, report, disposition_path, self.base / 'second'))]
        for thread in threads: thread.start()
        for thread in threads: thread.join(timeout=10); self.assertFalse(thread.is_alive())
        self.assertEqual(sorted(v[0] for v in results), ['rejected', 'success'])
        winner = next(value for status, value in results if status == 'success')
        self.assertEqual(sha((self.base / 'baseline.sysml').read_bytes()), winner)
        self.assertTrue(any('Expected baseline changed' in value for status, value in results if status == 'rejected'))


if __name__ == '__main__':
    unittest.main()
