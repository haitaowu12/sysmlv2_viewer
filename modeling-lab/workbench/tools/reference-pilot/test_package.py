import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from assess_package import check_decisions, check_support, check_package_views, check_exchanges
from check_contract import transition_fact
from receipts import sha

FIXTURE = Path(__file__).resolve().parents[2]/'fixtures/authoring/pump-station'


class PackageGates(unittest.TestCase):
    def setUp(self):
        self.ledger = json.loads((FIXTURE/'evidence-contract.json').read_text())
        self.support = json.loads((FIXTURE/'fact-support.json').read_text())
        self.contract = json.loads((FIXTURE/'contract.json').read_text())
        self.decisions = json.loads((FIXTURE/'decisions.json').read_text())

    def test_recorded_resolution_passes_with_visible_residual_scope(self):
        r = check_decisions(self.decisions, self.ledger, self.support)
        self.assertTrue(r['passed'])
        self.assertEqual([v['id'] for v in r['openOutsideClaims']], ['PS-DETAIL-01'])

    def test_open_conflict_blocks_even_when_no_model_target_is_attached(self):
        d = self.decisions['decisions'][0]
        d.update(status='open', resolutionClaim=None, resolutionChecks=[])
        r = check_decisions(self.decisions, self.ledger, self.support)
        self.assertFalse(r['passed'])
        self.assertEqual(r['findings'][0]['code'], 'unresolved-blocking-decision')

    def test_resolution_needs_citation_target_and_fact_link(self):
        for field in ('citations', 'targets'):
            ledger = copy.deepcopy(self.ledger)
            next(c for c in ledger['claims'] if c['id'] == 'policy-resolution')[field] = []
            self.assertFalse(check_decisions(self.decisions, ledger, self.support)['passed'])
        self.support['links'] = [l for l in self.support['links'] if l['claim'] != 'policy-resolution']
        self.assertFalse(check_decisions(self.decisions, self.ledger, self.support)['passed'])

    def test_scope_exclusion_cannot_be_unexplained(self):
        self.decisions['decisions'][0].update(status='open', resolutionClaim=None, resolutionChecks=[], impact='outside-claims')
        with self.assertRaises(ValueError):
            check_decisions(self.decisions, self.ledger, self.support)

    def test_omitting_a_conflict_from_the_register_does_not_bypass_review(self):
        self.decisions['decisions'].pop(0)
        result = check_decisions(self.decisions, self.ledger, self.support)
        self.assertFalse(result['passed'])
        self.assertEqual(result['findings'][0]['claims'], ['policy-conflict'])

    def test_each_expected_fact_needs_an_identified_source_claim(self):
        self.assertTrue(check_support(self.support, self.contract, self.ledger)['passed'])
        self.support['links'].pop()
        self.assertFalse(check_support(self.support, self.contract, self.ledger)['passed'])

    def test_unrelated_cited_claim_cannot_support_a_fact(self):
        self.support['links'][0]['claim'] = 'policy-resolution'
        self.assertFalse(check_support(self.support, self.contract, self.ledger)['passed'])

    def test_unrelated_cited_resolution_cannot_close_a_decision(self):
        self.decisions['decisions'][0]['resolutionClaim'] = 'assurance'
        self.assertFalse(check_decisions(self.decisions, self.ledger, self.support)['passed'])

    def test_unknown_or_provisional_support_is_rejected(self):
        for claim in ('absent', 'policy-conflict', 'unknowns'):
            support = copy.deepcopy(self.support)
            support['links'][0]['claim'] = claim
            self.assertFalse(check_support(support, self.contract, self.ledger)['passed'])

    def test_decision_schema_typos_do_not_weaken_gate(self):
        self.decisions['decisions'][0]['statuz'] = self.decisions['decisions'][0].pop('status')
        with self.assertRaises(ValueError):
            check_decisions(self.decisions, self.ledger, self.support)

    def test_view_checks_revision_bytes_exact_profile_and_named_exclusions(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory); (base/'sheet.svg').write_text('<svg/>')
            view = {'id': 'sheet', 'targets': ['S'], 'view': 'TREE', 'modelSha256': 'm',
                    'file': 'sheet.svg', 'artifactSha256': sha(base/'sheet.svg')}
            report = {'sourceSha256': 'm', 'elements': [], 'views': [view]}
            expected = [{'id': 'sheet', 'targets': ['S'], 'view': 'TREE', 'profile': 'pilot', 'excluded': []}]
            self.assertTrue(check_package_views(report, expected, base)['passed'])
            for key, value in [('modelSha256', 'stale'), ('notationProfile', 'fake'), ('artifactSha256', 'stale'), ('file', '../outside.svg')]:
                bad = copy.deepcopy(report); bad['views'][0][key] = value
                self.assertFalse(check_package_views(bad, expected, base)['passed'], key)
            (base/'sheet.svg').write_text('<svg>changed</svg>')
            self.assertFalse(check_package_views(report, expected, base)['passed'])

    def test_extra_exchange_to_same_endpoint_is_not_collapsed(self):
        elements = [{'sessionElementId': 'a', 'qualifiedName': 'S::a'}, {'sessionElementId': 'b', 'qualifiedName': 'S::b'},
                    {'sessionElementId': 'p', 'name': 'p'}]
        flow = {'source': ['a', 'p'], 'target': ['b', 'p'], 'item': 'I'}
        expected = [{'scope': 'S', 'source': 'S::a', 'sourcePort': 'p', 'target': 'S::b', 'targetPort': 'p', 'item': 'I'}]
        with patch('assess_package.interconnection', return_value={'flows': [flow, flow], 'excluded': []}):
            self.assertFalse(check_exchanges({'elements': elements}, ['S'], expected)['passed'])

    def test_transition_payload_type_is_resolved_through_accept_action(self):
        state = {'semantics': {'source': {'qualifiedName': 'S::off'}, 'target': {'qualifiedName': 'S::on'},
                              'triggerAction': [{'id': 'a'}], 'guardExpression': [], 'effectAction': []}}
        index = {'a': {'semantics': {'payloadParameter': {'id': 'p'}}},
                 'p': {'semantics': {'type': [{'id': 't', 'qualifiedName': 'Start'}]}}}
        self.assertEqual(transition_fact(state, index)['triggerTypes'], [['Start']])
        index['p']['semantics']['type'][0]['qualifiedName'] = 'Stop'
        self.assertEqual(transition_fact(state, index)['triggerTypes'], [['Stop']])

    def test_missing_transition_fields_do_not_mean_no_guards(self):
        self.assertEqual(transition_fact({'semantics': {}}, {}), {'unsupported': 'incomplete-transition-evidence'})


if __name__ == '__main__':
    unittest.main()
