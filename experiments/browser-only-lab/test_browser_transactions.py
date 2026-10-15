"""Browser Python context acceptance uses the real handler, with a tiny typed report fixture."""
import hashlib
import json
from pathlib import Path
import unittest


def context():
    def normalize(raw, source):
        return {'sourceSha256': hashlib.sha256(source.encode()).hexdigest(), 'staticChecksPassed': True, 'elements': [], 'views': []}
    env = {'json': json, 'hashlib': hashlib, 'normalize': normalize, 'views_for': lambda views: views,
           'exploration_views': lambda views, target, view: views, 'summarize': lambda old, new: [],
           'catalogue': lambda report: {'nodes': [], 'relations': []}, 'browser_report': lambda report: report}
    exec((Path(__file__).parent / 'public/python/browser_handler.py').read_text(), env)
    return env


def request(source, **extra):
    checked = {'valid': True, 'source': source, 'raw': [], 'diagnostics': []}
    return {'checked': checked, 'baseChecked': checked, 'views': [], **extra}


class BrowserAcceptedContext(unittest.TestCase):
    def setUp(self):
        self.env = context()
        self.original = self.env['render_report'](request('old', accept=True))

    def stage(self, token='project-1', source='new'):
        return self.env['render_report'](request(source, stage=True, transactionId=token,
            expectedBase=self.original['sourceSha256'], expectedReport=self.original['reportIntegrity']['reportSha256']))

    def accept(self, report, token='project-1'):
        return self.env['accept_current']({'transactionId': token, 'sourceSha256': report['sourceSha256'], 'reportSha256': report['reportIntegrity']['reportSha256']})

    def test_inspection_and_staging_do_not_replace_accepted_report(self):
        self.env['render_report'](request('inspected'))
        self.stage()
        self.assertEqual(self.env['current_report'], self.original)

    def test_accept_and_rollback_update_the_same_full_python_context(self):
        candidate = self.stage()
        self.assertTrue(self.accept(candidate)['accepted'])
        self.assertEqual(self.env['current_report'], candidate)
        self.env['rollback_current']({'transactionId': 'project-1'})
        self.assertEqual(self.env['current_report'], self.original)

    def test_invalid_staged_source_retains_the_accepted_model(self):
        invalid = request('broken', stage=True, transactionId='project-1')
        invalid['checked']['valid'] = False
        self.assertFalse(self.env['render_report'](invalid)['staticChecksPassed'])
        self.assertEqual(self.env['current_report'], self.original)
        self.assertIsNone(self.env['staged_report'])

    def test_invalid_diagnostic_uses_the_engine_source_span(self):
        checked={'valid':False,'source':'package Broken {','raw':[],
                 'diagnostics':[{'severity':'error','message':"expected '}'",'span':{'startLine':4,'startCol':2}}]}
        report=self.env['normalized'](checked)
        self.assertEqual(report['diagnostics'][0]['line'],4)
        self.assertEqual(report['diagnostics'][0]['span']['startCol'],2)
        self.assertEqual(self.env['current_report'],self.original)

    def test_same_hash_candidate_from_superseded_project_is_rejected(self):
        candidate = self.stage('project-1')
        self.stage('project-2')
        with self.assertRaisesRegex(ValueError, 'no longer current'): self.accept(candidate, 'project-1')
        self.assertEqual(self.env['current_report'], self.original)
        self.accept(candidate, 'project-2')
        self.assertEqual(self.env['current_report']['source'], 'new')

    def test_report_mismatch_and_changed_prior_identity_cannot_commit(self):
        candidate = self.stage()
        wrong = {**candidate, 'sourceSha256': 'wrong'}
        with self.assertRaisesRegex(ValueError, 'match'): self.accept(wrong)
        self.env['current_report'] = {**self.original, 'sourceSha256': 'different accepted project'}
        with self.assertRaisesRegex(ValueError, 'match'): self.accept(candidate)
        self.assertEqual(self.env['current_report']['sourceSha256'], 'different accepted project')


if __name__ == '__main__': unittest.main()

class RequiredBrowserViews(unittest.TestCase):
    def test_exploration_budget_failure_keeps_small_required_views_and_valid_inspection(self):
        import runpy
        delivery=runpy.run_path(str(Path(__file__).resolve().parents[2]/'modeling-lab/workbench/tools/reference-pilot/lab_delivery.py'))
        for operation in ['inspect','staged-render','legacy-render']:
            with self.subTest(operation=operation):
                env=context()
                old=env['render_report'](request('old',accept=True))
                budget_error='Model exceeds the 2000-occurrence exploration budget; split the source package. No partial catalogue returned.'
                def over_budget(report):raise ValueError(budget_error)
                env.update(catalogue=over_budget,browser_report=delivery['browser_report'],
                           project=lambda *args:{'subject':'Study::SmallScope'},
                           render_svg=lambda projection:'<svg>Small scoped view</svg>')
                data=request('large valid source')
                data['views']=[{'id':'small-scope','names':['Study::SmallScope'],'view':'TREE'}]
                if operation=='staged-render':
                    data.update(stage=True,transactionId='large-model',expectedBase=old['sourceSha256'],expectedReport=old['reportIntegrity']['reportSha256'])
                elif operation=='legacy-render':data['accept']=True
                report=env['render_report'](data)
                self.assertTrue(report['staticChecksPassed'])
                self.assertEqual(report['catalogueError'],budget_error)
                self.assertNotIn('catalogue',report)
                self.assertEqual(report['views'][0]['svg'],'<svg>Small scoped view</svg>')
                self.assertEqual(report['views'][0]['stakeholderSvg'],'<svg>Small scoped view</svg>')
                if operation=='inspect':self.assertEqual(env['current_report'],old)
                elif operation=='staged-render':
                    self.assertEqual(env['current_report'],old)
                    receipt=env['accept_current']({'transactionId':'large-model','sourceSha256':report['sourceSha256'],'reportSha256':report['reportIntegrity']['reportSha256']})
                    self.assertTrue(receipt['accepted'])
                    self.assertEqual(env['current_report']['catalogueError'],budget_error)
                else:self.assertEqual(env['current_report']['source'],'large valid source')

    def test_failed_required_projection_cannot_stage_or_receive_acceptance(self):
        env = context()
        old = env['render_report'](request('old', accept=True))
        def missing(*args): raise ValueError('Projection target does not exist')
        env['project'] = missing
        candidate = request('new', stage=True, transactionId='broken-view', expectedBase=old['sourceSha256'], expectedReport=old['reportIntegrity']['reportSha256'])
        candidate['views'] = [{'id': 'overview', 'names': ['Missing::Target'], 'view': 'INTERCONNECTION', 'renderer': 'engineering'}]
        with self.assertRaisesRegex(ValueError, 'Required view overview.*Projection target does not exist'):
            env['render_report'](candidate)
        self.assertEqual(env['current_report'], old)
        self.assertIsNone(env['staged_report'])
        with self.assertRaisesRegex(ValueError, 'no longer current'):
            env['accept_current']({'transactionId': 'broken-view', 'sourceSha256': 'new', 'reportSha256': 'anything'})

    def test_explicit_unknown_evidence_remains_a_valid_drawing(self):
        env = context()
        env.update(project=lambda *args: {'warnings': ['Condition evidence unavailable; do not infer absence']}, render_svg=lambda projection: '<svg>Unknown condition evidence</svg>')
        candidate = request('new', stage=True, transactionId='unknown-facts', expectedBase=None, expectedReport=None)
        candidate['views'] = [{'id': 'overview', 'names': ['Study::System'], 'view': 'TREE'}]
        report = env['render_report'](candidate)
        self.assertTrue(env['accept_current']({'transactionId': 'unknown-facts', 'sourceSha256': report['sourceSha256'], 'reportSha256': report['reportIntegrity']['reportSha256']})['accepted'])
        self.assertIn('unavailable', env['current_report']['views'][0]['stakeholder']['warnings'][0])

    def test_readonly_source_discovery_can_report_unavailable_presentation_without_changing_context(self):
        env = context()
        old = env['render_report'](request('old', accept=True))
        def missing(*args): raise ValueError('Current preset belongs to a different model')
        env['project'] = missing
        inspected = request('new source')
        inspected['views'] = [{'id': 'overview', 'names': ['Old::Scope'], 'view': 'TREE'}]
        report = env['render_report'](inspected)
        self.assertTrue(report['staticChecksPassed']); self.assertIn('error', report['views'][0])
        self.assertEqual(env['current_report'], old)
