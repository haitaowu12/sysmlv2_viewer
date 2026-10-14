import contextlib
import copy
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import qualify
from report_integrity import digest, load_report, view_recipe_sha256
from assess_package import check_package_views
from review_routes import prepare


class QualificationIntegrityTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        (self.root/'config').mkdir()
        tools = self.root/'tools/reference-pilot'; tools.mkdir(parents=True)
        (tools/'ReferencePilot.java').write_text('/* deterministic mocked runner */')
        (tools/'engineering.py').write_text('# deterministic producer fixture')
        self.jar = self.root/'engine.jar'; self.jar.write_bytes(b'mock engine, never executed')
        self.lib = self.root/'lib'; self.lib.mkdir(); (self.lib/'Fixture.sysml').write_text('package Library {}')
        lock = {'jarSha256': qualify.sha(self.jar), 'libraryTreeSha256': qualify.library_hash(self.lib)[0]}
        (self.root/'config/reference-pilot-lock.json').write_text(json.dumps(lock))
        self.source = self.root/'model.sysml'; self.source.write_text('package P { attribute count = 2; }')
        self.original = self.source.read_bytes()
        self.views = self.root/'views.json'
        self.recipe = [{'id': 'parts', 'names': ['P'], 'view': 'TREE', 'styles': [], 'renderer': 'pilot'}]
        self.views.write_text(json.dumps(self.recipe))
        self.output = self.root/'out'

    def run_qualifier(self, mutation=None):
        def fake_run(args, **kwargs):
            if args[:2] == ['java', '-version']:
                return subprocess.CompletedProcess(args, 0, stdout='', stderr='openjdk fixture')
            if args[:2] == ['dot', '-V']:
                return subprocess.CompletedProcess(args, 0, stdout='', stderr='dot fixture')
            self.assertEqual(args[:2], ['java', '-Xmx2g'])
            parsed_source = Path(args[-3])
            parsed_views = Path(args[-2])
            self.assertNotEqual(parsed_source, self.source)
            self.assertNotEqual(parsed_views, self.views)
            self.assertEqual(parsed_source.read_bytes(), self.original)
            requests = json.loads(parsed_views.read_text())
            (self.output/'parts.svg').write_text('<svg/>')
            (self.output/'parts-raw.svg').write_text('<svg>raw</svg>')
            report = {'staticChecksPassed': True, 'elements': [{'semantics': {'value': 2}}], 'diagnostics': [],
                      'views': [{'id': v['id'], 'targets': v['names'], 'view': v['view'], 'file': v['id']+'.svg', 'rawFile': v['id']+'-raw.svg'} for v in requests]}
            (self.output/'report.json').write_text(json.dumps(report))
            if mutation: mutation(parsed_source, parsed_views)
            return subprocess.CompletedProcess(args, 0)
        argv = ['qualify.py', '--jar', str(self.jar), '--library', str(self.lib), '--source', str(self.source),
                '--views', str(self.views), '--output', str(self.output)]
        with patch.object(qualify, 'ROOT', self.root), patch.object(sys, 'argv', argv), \
             patch.object(qualify.subprocess, 'run', side_effect=fake_run), contextlib.redirect_stdout(io.StringIO()):
            return qualify.main()

    def test_editor_race_keeps_facts_bound_to_actual_source_and_view_snapshots(self):
        def editor(source, views):
            self.source.write_text('package P { attribute count = 3; }')
            changed = copy.deepcopy(self.recipe); changed[0]['view'] = 'INTERCONNECTION'
            self.views.write_text(json.dumps(changed))
        self.assertEqual(self.run_qualifier(editor), 0)
        report = load_report(self.output/'report.json', source=self.original)
        self.assertEqual(report['sourceSha256'], digest(self.original))
        self.assertEqual(report['elements'][0]['semantics']['value'], 2)
        self.assertEqual(report['views'][0]['view'], 'TREE')
        self.assertEqual(report['views'][0]['viewRecipeSha256'], view_recipe_sha256(self.recipe[0]))
        self.assertEqual(report['reportIntegrity']['status'], 'verified-managed')
        with self.assertRaises(ValueError): load_report(self.output/'report.json', source=self.source)
        inputs = json.loads((self.output/'inputs.json').read_text())
        self.assertEqual(inputs['sourceSha256'], report['sourceSha256'])
        self.assertEqual(inputs['producerImplementationSha256'], report['producerImplementationSha256'])

    def test_parsed_snapshot_mutation_never_gets_integrity_receipt(self):
        with self.assertRaisesRegex(ValueError, 'snapshot changed'):
            self.run_qualifier(lambda source, views: source.write_text('package Different {}'))
        self.assertFalse((self.output/'report-integrity.json').exists())
        with self.assertRaises(ValueError): load_report(self.output/'report.json')

    def test_tampered_semantics_snapshots_producer_inputs_and_svg_are_rejected(self):
        self.run_qualifier()
        for name in ('report.json', 'inputs.json', 'source.snapshot.sysml', 'views.snapshot.json',
                     'producer/ReferencePilot.java', 'parts.svg', 'parts-raw.svg'):
            path = self.output/name; original = path.read_bytes()
            path.write_bytes(original + b' ')
            with self.assertRaises(ValueError, msg=name): load_report(self.output/'report.json')
            path.write_bytes(original)
        report_path = self.output/'report.json'
        report = json.loads(report_path.read_text()); report['elements'][0]['semantics']['value'] = 999
        report_path.write_text(json.dumps(report))
        with self.assertRaisesRegex(ValueError, 'content digest'): load_report(report_path)

    def test_imports_need_explicit_opt_in_and_cannot_claim_managed_identity(self):
        path = self.root/'imported.json'; path.write_text(json.dumps({'sourceSha256': digest(self.original)}))
        with self.assertRaises(ValueError): load_report(path)
        self.assertEqual(load_report(path, require_managed=False)['reportIntegrity']['status'], 'imported-unverified')
        path.write_text(json.dumps({'producerIntegrity': {'receiptFile': 'report-integrity.json'}}))
        with self.assertRaises(ValueError): load_report(path, require_managed=False)

    def test_old_realized_views_do_not_satisfy_changed_request_recipe(self):
        self.run_qualifier()
        report = load_report(self.output/'report.json')
        expected = [{'id': 'parts', 'targets': ['P'], 'view': 'TREE', 'profile': 'pilot', 'excluded': []}]
        report['elements'] = []
        self.assertTrue(check_package_views(report, expected, self.output, self.recipe)['passed'])
        for key, value in [('view', 'INTERCONNECTION'), ('names', ['Missing']), ('renderer', 'summary'), ('styles', ['LR'])]:
            recipe = copy.deepcopy(self.recipe); recipe[0][key] = value
            result = check_package_views(report, expected, self.output, recipe)
            self.assertFalse(result['passed'], key)
            self.assertIn('requested-view-recipe-mismatch', [f['code'] for f in result['findings']])


class ReviewRecipeTests(unittest.TestCase):
    def test_material_recipe_changes_invalidate_review_basis_and_legacy_is_unbound(self):
        view = {'id': 'v', 'names': ['P'], 'view': 'TREE', 'styles': [], 'renderer': 'pilot'}
        pack = {'schemaVersion': 2, 'reviewedSourceSha256': 'a'*64, 'routes': [
            {'id': 'r', 'title': 'Review', 'audience': 'Owner', 'objective': 'Resolve concern', 'steps': [
                {'viewId': 'v', 'targets': ['P'], 'question': 'Which responsibilities?',
                 'reviewedViewRecipeSha256': view_recipe_sha256(view)}]}]}
        self.assertEqual(prepare(pack, 'a'*64, [view])['status'], 'source-matches-review-basis')
        for key, value in [('view', 'INTERCONNECTION'), ('renderer', 'summary'), ('styles', ['LR']), ('depth', 2)]:
            changed = {**view, key: value}
            out = prepare(pack, 'a'*64, [changed])
            self.assertEqual(out['status'], 'review-basis-changed', key)
            self.assertEqual(out['changedViewIds'], ['v'])
        legacy = copy.deepcopy(pack); legacy['schemaVersion'] = 1
        legacy['routes'][0]['steps'][0].pop('reviewedViewRecipeSha256')
        self.assertEqual(prepare(legacy, 'a'*64, [view])['status'], 'review-view-basis-missing')
        missing = copy.deepcopy(legacy); missing['schemaVersion'] = 2
        with self.assertRaises(ValueError): prepare(missing, 'a'*64, [view])


if __name__ == '__main__':
    unittest.main()
