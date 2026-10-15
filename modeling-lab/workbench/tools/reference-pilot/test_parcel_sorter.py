"""Semantic checks against a freshly qualified external parcel-sorter report.

Set SYSML_PARCEL_REPORT to report.json from the managed package launcher.
Skipped without that evidence; source text alone cannot make these checks pass.
"""
import hashlib
import json
import os
from pathlib import Path
import unittest

from agent_model import context, serialized_context
from check_contract import check_contract, expression_fact, facts, references, documentation_facts
from engineering import index_report, interconnection, sem
from report_integrity import load_report
from presentation import cardinality, part_features, scalar_alias_evidence
from stakeholder import project
from view_scope import catalogue

FIXTURE = Path(__file__).resolve().parents[2] / 'fixtures/authoring/parcel-sorter'
REPORT = os.environ.get('SYSML_PARCEL_REPORT')


@unittest.skipUnless(REPORT, 'Requires fresh managed parcel-sorter qualification report')
class ParcelSorterSemanticTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = load_report(Path(REPORT), source=FIXTURE / 'model.sysml')
        cls.source = (FIXTURE / 'model.sysml').read_text()
        cls.index = index_report(cls.report)
        if cls.report.get('staticChecksPassed') is not True:
            raise AssertionError('Fresh language checks failed')
        if cls.report.get('sourceSha256') != hashlib.sha256(cls.source.encode()).hexdigest():
            raise AssertionError('Report does not match current parcel model')
        if cls.report.get('reportIntegrity', {}).get('status') != 'verified-managed':
            raise AssertionError('Requires managed report provenance')

    def named(self, name):
        found = [e for e in self.report['elements'] if e.get('qualifiedName') == 'ParcelSortingStudy::' + name]
        self.assertEqual(len(found), 1, name)
        return found[0]

    def test_independent_fact_contract(self):
        result = check_contract(self.report, json.loads((FIXTURE / 'expected-facts.json').read_text()))
        self.assertTrue(result['passed'], result)

    def test_repeated_actuator_types_and_distinct_signed_defaults(self):
        for side, asset in [('A', 'QA-DA-01'), ('B', 'QA-DB-02')]:
            root = self.named('sorter::diverter' + side + '::actuator')
            self.assertEqual(facts(root, self.index)['types'], ['ParcelSortingStudy::RotaryActuator'])
            tag = self.named('sorter::diverter' + side + '::actuator::assetTag')
            self.assertEqual(facts(tag, self.index)['literalValues'], [asset])
        a = self.named('sorter::diverterA::actuator::homeAngle')
        self.assertEqual(facts(a, self.index)['literalValues'], [12.0])
        b = self.named('sorter::diverterB::actuator::homeAngle')
        expressions = [self.index[r['id']] for r in references(sem(b, 'ownedElement'))
                       if r['id'] in self.index and self.index[r['id']]['metaclass'] == 'OperatorExpression']
        self.assertEqual(len(expressions), 1)
        self.assertEqual(expression_fact(expressions[0], self.index),
                         {'kind': 'OperatorExpression', 'operator': '-',
                          'operands': [{'kind': 'LiteralRational', 'value': 8.0}]})

    def test_four_typed_flows_preserve_opposite_roles_and_payloads(self):
        view = interconnection(self.report, 'ParcelSortingStudy::context')
        self.assertFalse(view['excluded'])
        self.assertEqual(len(view['flows']), 4)
        actual = {(self.index[f['source'][0]]['name'], self.index[f['target'][0]]['name'], f['item']) for f in view['flows']}
        self.assertEqual(actual, {('warehouse', 'station', 'RouteDispatch'), ('warehouse', 'station', 'ResumeAuthorisation'),
                                  ('station', 'warehouse', 'RouteAcknowledgement'), ('station', 'warehouse', 'JamReport')})
        expected = {'RouteDispatch': {'commandId', 'parcelId', 'intendedLane'},
                    'RouteAcknowledgement': {'commandId', 'acknowledged'},
                    'JamReport': {'parcelId', 'affectedDiverter'},
                    'ResumeAuthorisation': {'authorisationId', 'stationId'}}
        for item, fields in expected.items():
            root = self.named(item)
            own = {e.get('name') for e in self.index.values() if e['metaclass'] == 'AttributeUsage' and sem(e, 'owner', {}).get('id') == root['sessionElementId']}
            self.assertEqual(own, fields)
        self.assertTrue(sem(self.named('warehouseControl'), 'isReference'))
        self.assertTrue(sem(self.named('operator'), 'isReference'))

    def test_context_scalar_aliases_remain_references_with_unknown_exported_cardinality(self):
        root=self.named('context')
        ordinary,collections=part_features(root,self.index)
        self.assertEqual({e['name'] for e in ordinary},{'station','warehouse','operator'})
        self.assertEqual(collections,[])
        for name in ('station','warehouse','operator'):
            alias=self.named('context::'+name)
            self.assertFalse(sem(alias,'isComposite'))
            self.assertEqual(cardinality(alias,self.index)['status'],'unknown')
            values=[self.index[r['id']] for r in references(sem(alias,'ownedElement'))
                    if self.index.get(r['id'],{}).get('metaclass')=='FeatureReferenceExpression']
            self.assertEqual(len(values),1)
            proof=scalar_alias_evidence(alias,values[0],self.index)
            self.assertEqual(proof['cardinality'],'unknown')
            self.assertIn(alias['sessionElementId'],proof['evidenceIds'])

    def test_human_agent_and_stakeholder_share_exact_occurrence(self):
        c = catalogue(self.report)
        occurrence = next(n for n in c['nodes'] if n['key'] == 'ParcelSortingStudy::sorter/diverterB/actuator')
        chosen = self.named('sorter::diverterB::actuator')
        self.assertEqual(occurrence['elementId'], chosen['sessionElementId'])
        ctx = context(self.report, self.source, occurrence['key'], depth=1, byte_budget=16384)
        self.assertEqual(ctx['selection']['definitionElementId'], chosen['sessionElementId'])
        self.assertEqual(ctx['selection']['qualifiedName'], chosen['qualifiedName'])
        self.assertEqual(ctx['selection']['occurrenceKey'], occurrence['key'])
        self.assertLessEqual(len(serialized_context(ctx)), 16384)
        self.assertIn('elements', ctx['omissions'])
        self.assertIn('continuation', ctx)
        p = project(self.report, 'ParcelSortingStudy::sorter', {'view': 'TREE'})
        self.assertTrue(any(n.get('elementId') == chosen['sessionElementId'] for n in p['nodes']))
        self.assertEqual(p['sourceSha256'], ctx['sourceSha256'])
        self.assertFalse(any(n['key'].endswith('/diverterA/actuator') for n in ctx['occurrenceWitnesses']))

    def test_ambiguity_and_planned_check_remain_without_false_assurance(self):
        requirement = self.named('acknowledgementTiming')
        bodies = ' '.join(d['body'] for d in documentation_facts(requirement, self.index))
        self.assertIn('120 milliseconds', bodies)
        self.assertIn('ACK-MEANING-01 OPEN', bodies)
        self.assertIn('completed physical diversion', bodies)
        self.assertIn('accepted dispatch message', bodies)
        self.assertFalse(any(e['metaclass'] == 'SatisfyRequirementUsage' for e in self.index.values()))
        check = project(self.report, 'ParcelSortingStudy::PlannedJourneyCheck')
        self.assertEqual(check['acceptance'], 'Not assessed')
        self.assertIn('no executable procedure', check['statement'])
        decisions = json.loads((FIXTURE / 'decisions.json').read_text())
        ack = next(d for d in decisions['issues'] if d['id'] == 'ACK-MEANING-01')
        self.assertEqual(ack['status'], 'open')
        self.assertTrue(ack['blocking'])
        self.assertEqual(ack['resolutionChecks'], [])

    def test_views_and_resume_story_are_revision_bound_declarations(self):
        self.assertEqual(len(self.report['views']), 4)
        for view in self.report['views']:
            self.assertNotIn('error', view)
            self.assertEqual(view['modelSha256'], self.report['sourceSha256'])
            self.assertTrue(view['artifactSha256'])
        p = project(self.report, 'ParcelSortingStudy::JamRecoveryStory')
        resume_id = self.named('JamRecoveryStory::resumeSorting')['sessionElementId']
        resume = next(e for e in p['behavior']['relations'] if e['elementId'] == resume_id)
        self.assertEqual((resume['source'], resume['target']), (
            self.named('JamRecoveryStory::recoveryPending')['sessionElementId'],
            self.named('JamRecoveryStory::resumedSorting')['sessionElementId']))
        self.assertEqual(resume['conditionStatus']['guards'], 'resolved')
        self.assertEqual([g['text'] for g in resume['guards']], ['operatorClearanceReported'])
        row = next(r for r in p['rows'] if resume_id in r['elementIds'])
        self.assertIn('Guard: operatorClearanceReported', row['body'])
        self.assertEqual(p['acceptance'], 'Not assessed')


if __name__ == '__main__':
    unittest.main()
