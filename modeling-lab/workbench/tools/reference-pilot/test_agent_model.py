import copy
import tempfile
import unittest
from pathlib import Path
from agent_model import candidate, context, sha
from review_routes import prepare, view_recipe_sha256


class AgentWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name)
        self.source = 'package P {\n    part motor;\n    attribute count = 2;\n}'
        self.report = {'staticChecksPassed': True, 'sourceSha256': sha(self.source.encode()), 'elements': [
            {'sessionElementId': 'p', 'qualifiedName': 'P', 'name': 'P', 'metaclass': 'Package', 'source': self.source, 'line': 1, 'semantics': {'ownedElement': [{'id': 'm'}, {'id': 'c'}]}},
            {'sessionElementId': 'm', 'qualifiedName': 'P::motor', 'name': 'motor', 'metaclass': 'PartUsage', 'source': 'part motor;', 'line': 2, 'semantics': {'owner': {'id': 'p', 'qualifiedName': 'P'}}},
            {'sessionElementId': 'c', 'qualifiedName': 'P::count', 'name': 'count', 'metaclass': 'AttributeUsage', 'source': 'attribute count = 2;', 'line': 3, 'semantics': {'owner': {'id': 'p', 'qualifiedName': 'P'}}}]}
        raw = b'Illustrative input.\nChange the declared count to three.\n'
        (self.base/'input.txt').write_bytes(raw)
        self.proposal = {'schemaVersion': 1, 'baseSourceSha256': self.report['sourceSha256'],
                         'evidence': [{'id': 'E1', 'path': 'input.txt', 'sha256': sha(raw), 'startLine': 2, 'endLine': 2, 'quote': 'Change the declared count to three.'}],
                         'changes': [{'target': 'P::count', 'before': 'attribute count = 2;', 'after': 'attribute count = 3;', 'reason': 'Supplied correction', 'evidenceIds': ['E1']}]}

    def test_context_has_incoming_and_outgoing_source_anchors(self):
        result = context(self.report, self.source, 'P::motor')
        self.assertEqual(result['elements'][0]['qualifiedName'], 'P::motor')
        self.assertEqual(result['elements'][0]['line'], 2)
        self.assertTrue(any(r['source']=='p' and r['target']=='m' for r in result['references']))
        self.assertTrue(any(r['source']=='m' and r['target']=='p' for r in result['references']))

    def test_context_reports_bounded_omissions(self):
        result = context(self.report, self.source, 'P', depth=1, limit=1)
        self.assertEqual(len(result['elements']), 1)
        self.assertEqual(result['omittedNeighborCount'], 2)

    def test_rejects_stale_invalid_and_ambiguous_context(self):
        with self.assertRaises(ValueError): context(self.report, self.source+' ', 'P')
        self.report['staticChecksPassed'] = False
        with self.assertRaises(ValueError): context(self.report, self.source, 'P')
        self.report['staticChecksPassed'] = True
        self.report['elements'].append({**self.report['elements'][1], 'sessionElementId': 'm2'})
        with self.assertRaises(ValueError): context(self.report, self.source, 'P::motor')

    def test_candidate_preserves_unrelated_source_and_is_not_accepted(self):
        result, receipt = candidate(self.report, self.source, self.proposal, self.base)
        self.assertEqual(result, self.source.replace('count = 2', 'count = 3'))
        self.assertEqual(receipt['status'], 'proposed-not-validated')
        self.assertIn('part motor;', result)
        self.assertNotIn('candidate.sysml', [p.name for p in self.base.iterdir()])

    def test_rejects_stale_proposal_and_changed_input(self):
        p = copy.deepcopy(self.proposal); p['baseSourceSha256'] = 'f'*64
        with self.assertRaises(ValueError): candidate(self.report, self.source, p, self.base)
        (self.base/'input.txt').write_text('Different instruction')
        with self.assertRaises(ValueError): candidate(self.report, self.source, self.proposal, self.base)

    def test_rejects_forged_quote_outside_path_and_unknown_support(self):
        for update in ({'quote': 'Invented'}, {'path': '../escape.txt'}):
            p = copy.deepcopy(self.proposal); p['evidence'][0].update(update)
            with self.assertRaises(ValueError): candidate(self.report, self.source, p, self.base)
        p = copy.deepcopy(self.proposal); p['changes'][0]['evidenceIds']=['unknown']
        with self.assertRaises(ValueError): candidate(self.report, self.source, p, self.base)

    def test_rejects_wrong_target_and_overlapping_edits(self):
        p = copy.deepcopy(self.proposal); p['changes'][0]['target']='P::motor'
        with self.assertRaises(ValueError): candidate(self.report, self.source, p, self.base)
        p = copy.deepcopy(self.proposal); p['changes'] *= 2
        with self.assertRaises(ValueError): candidate(self.report, self.source, p, self.base)

    def test_rejects_repeated_fragment(self):
        source=self.source.replace('part motor;', 'attribute count = 2;')
        report={**self.report, 'sourceSha256': sha(source.encode())}
        proposal={**self.proposal, 'baseSourceSha256': report['sourceSha256']}
        with self.assertRaises(ValueError): candidate(report, source, proposal, self.base)

    def test_review_routes_bind_targets_and_expose_changed_basis(self):
        pack={'schemaVersion':2,'reviewedSourceSha256':'a'*64,'routes':[{'id':'r','title':'Review','audience':'Owner','objective':'Resolve scope','steps':[{'viewId':'v','targets':['P'],'question':'Which scope?'}]}]}
        views=[{'id':'v','view':'tree','targets':['P']}]
        pack['routes'][0]['steps'][0]['reviewedViewRecipeSha256']=view_recipe_sha256(views[0])
        self.assertEqual(prepare(pack,'a'*64,views)['status'],'source-matches-review-basis')
        self.assertEqual(prepare(pack,'b'*64,views)['status'],'review-basis-changed')
        with self.assertRaises(ValueError): prepare(pack,'a'*64,[{'id':'v','targets':['Other']}])
        with self.assertRaises(ValueError): prepare(pack,'a'*64,[])


if __name__ == '__main__': unittest.main()
