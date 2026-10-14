"""Synthetic import tests: occurrence identity and actual serialized context bounds."""
import copy
import json
import tempfile
import subprocess
import sys
import unittest
from pathlib import Path
from agent_model import context, candidate, sha, serialized_context
from test_engineering import element, ref
from view_scope import catalogue


def repeated_model():
    source = 'package P { part def Unit { part motor; } part def Root { part duty : Unit; part standby : Unit; } }'
    motor = element('motor', 'PartUsage', 'motor', isComposite=True, feature=[])
    motor['source'] = 'part motor;'
    unit = element('unit', 'PartDefinition', 'Unit', feature=[ref(motor)])
    duty = element('duty', 'PartUsage', 'duty', type=[ref(unit)], feature=[ref(motor)], isComposite=True)
    standby = element('standby', 'PartUsage', 'standby', type=[ref(unit)], feature=[ref(motor)], isComposite=True)
    root = element('root', 'PartDefinition', 'Root', feature=[ref(duty), ref(standby)])
    for e in (duty, standby):
        e['semantics']['owner'] = ref(root)
    motor['semantics']['owner'] = ref(unit)
    report = {'staticChecksPassed': True, 'sourceSha256': sha(source.encode()),
              'elements': [root, duty, standby, unit, motor]}
    return report, source


class AgentContextTests(unittest.TestCase):
    def test_exact_human_keys_select_repeated_child_with_shared_facts(self):
        report, source = repeated_model()
        keys = {n['key'] for n in catalogue(report)['nodes']}
        for target in ['P::Root/duty/motor', 'P::Root/standby/motor']:
            self.assertIn(target, keys)
            result = context(report, source, target, depth=0)
            self.assertEqual(result['selection']['occurrenceKey'], target)
            self.assertEqual(result['selection']['definitionElementId'], 'motor')
            self.assertEqual(result['elements'][0]['factScope'], 'shared-source-element')
            self.assertEqual(result['elements'][0]['sourceExcerpt'], 'part motor;')
            self.assertEqual(result['occurrenceWitnesses'][0]['key'], target)
            self.assertFalse(result['elements'][0]['resolvedFacts']['literalValues'])
            sibling = 'standby' if '/duty/' in target else 'duty'
            self.assertFalse(any('/'+sibling in n['key'] for n in result['occurrenceWitnesses']))
        self.assertEqual(context(report, source, 'P::motor', depth=0)['selection']['kind'], 'source-element')
        self.assertEqual(context(report, source, 'P::Root/duty/motor')['reportIntegrity']['status'], 'imported-unverified')

    def test_contextual_connection_witness_keeps_repeated_endpoints_separate(self):
        report, source = repeated_model()
        ix = {e['sessionElementId']: e for e in report['elements']}
        port = element('port', 'PortUsage', 'signal')
        control = element('control', 'PartUsage', 'control', feature=[ref(port)], isComposite=True)
        ix['motor']['semantics']['feature'] = [ref(port)]
        a = element('endA', 'Feature', 'endA', chainingFeature=[ref(ix['motor']), ref(port)])
        b = element('endB', 'Feature', 'endB', chainingFeature=[ref(control), ref(port)])
        link = element('link', 'ConnectionUsage', 'declared', relatedFeature=[ref(a), ref(b)])
        for scope in ['unit', 'duty', 'standby']:
            ix[scope]['semantics']['feature'] += [ref(control), ref(link)]
        report['elements'] += [port, control, a, b, link]
        for side in ['duty', 'standby']:
            page = context(report, source, 'P::Root/'+side+'/motor', depth=0)
            self.assertEqual(len(page['contextualRelations']), 1)
            relation = page['contextualRelations'][0]
            self.assertEqual(relation['elementId'], 'link')
            self.assertEqual(relation['source']['node'], 'P::Root/'+side+'/motor')
            self.assertEqual(relation['target']['node'], 'P::Root/'+side+'/control')
            self.assertEqual(relation['kind'], 'connection')

    def test_missing_occurrence_does_not_fall_back_to_definition(self):
        report, source = repeated_model()
        with self.assertRaisesRegex(ValueError, 'no longer resolves'):
            context(report, source, 'P::Root/missing/motor')
        for target in [None, '', 123]:
            with self.assertRaises(ValueError): context(report, source, target)

    def test_budget_utf8_continuation_coverage_and_determinism(self):
        report, source = repeated_model()
        for i in range(160):
            e = element('x'+str(i), 'AttributeUsage', '温度'+str(i))
            e['source'] = '温度条件' * 1000
            e['semantics']['owner'] = ref(report['elements'][0])
            report['elements'][0]['semantics']['ownedElement'] = report['elements'][0]['semantics'].get('ownedElement', []) + [ref(e)]
            report['elements'].append(e)
        target = 'P::Root'
        token = None; pages = []
        while True:
            page = context(report, source, target, depth=1, limit=100, byte_budget=4096, continuation=token)
            self.assertLessEqual(len(serialized_context(page)), 4096)
            self.assertEqual(page['serializedBytes'], len(serialized_context(page)))
            self.assertEqual(page, context(report, source, target, depth=1, limit=100, byte_budget=4096, continuation=token))
            pages.append(page)
            token = page['continuation']
            if token is None: break
            self.assertLess(len(pages), 300)
        self.assertGreater(len(pages), 1)
        self.assertEqual(pages[-1]['page']['endCursor'], sum(pages[0]['omissions'][c]['totalInQuery'] for c in pages[0]['omissions']))
        for category in pages[0]['omissions']:
            retrieved = sum(len(p[category]) + p['omissions'][category]['oversizedThisPage'] for p in pages)
            self.assertEqual(retrieved, pages[0]['omissions'][category]['totalInQuery'])
        self.assertTrue(any(p['omissions']['elements']['oversizedThisPage'] for p in pages))

    def test_default_actual_wire_size_and_changed_binding_rejected(self):
        report, source = repeated_model()
        for i in range(50):
            e = element('x'+str(i), 'AttributeUsage', 'x'+str(i)); e['source'] = 'x'*1900
            e['semantics']['owner'] = ref(report['elements'][0]); report['elements'].append(e)
        result = context(report, source, 'P::Root', limit=100)
        self.assertLessEqual(len(serialized_context(result)), 16384)
        self.assertIsNotNone(result['continuation'])
        for kwargs in [{'depth': 0}, {'limit': 30}, {'byte_budget': 4096}, {'target': 'P::Root/duty'}]:
            options = dict(target='P::Root', limit=100, continuation=result['continuation']); options.update(kwargs)
            with self.assertRaisesRegex(ValueError, 'mismatched'): context(report, source, **options)
        changed = copy.deepcopy(report); changed['reportIntegrity'] = {'status': 'imported-unverified', 'reportSha256': 'f'*64}
        with self.assertRaisesRegex(ValueError, 'mismatched'):
            context(changed, source, 'P::Root', limit=100, continuation=result['continuation'])
        changed = copy.deepcopy(report); changed['elements'][-1]['source'] += 'new fact'
        with self.assertRaisesRegex(ValueError, 'mismatched'):
            context(changed, source, 'P::Root', limit=100, continuation=result['continuation'])
        changed = copy.deepcopy(report); changed_source = source+' '; changed['sourceSha256'] = sha(changed_source.encode())
        with self.assertRaisesRegex(ValueError, 'mismatched'):
            context(changed, changed_source, 'P::Root', limit=100, continuation=result['continuation'])
        with self.assertRaises(ValueError): context(report, source, 'P::Root', continuation='garbage')

    def test_cli_requires_managed_receipt_before_context_or_proposal(self):
        report, source = repeated_model()
        with tempfile.TemporaryDirectory() as name:
            base = Path(name); report_path = base/'report.json'; source_path = base/'model.sysml'
            report_path.write_text(json.dumps(report)); source_path.write_text(source)
            for operation in ['context', 'propose']:
                output = base/(operation+'-output')
                command = [sys.executable, '-B', str(Path(__file__).with_name('agent_model.py')),
                           operation, '--report', str(report_path), '--source', str(source_path),
                           '--target', 'P::Root/duty/motor', '--output', str(output)]
                if operation == 'propose': command += ['--proposal', str(base/'unused-proposal.json')]
                run = subprocess.run(command, capture_output=True, text=True)
                self.assertNotEqual(run.returncode, 0)
                self.assertIn('integrity receipt is missing', run.stderr)
                self.assertFalse(output.exists())

    def test_occurrence_proposal_requires_explicit_shared_edit_scope(self):
        report, source = repeated_model()
        with tempfile.TemporaryDirectory() as name:
            base = Path(name); raw = b'Proposed shared motor rename.'; (base/'evidence.txt').write_bytes(raw)
            proposal = {'schemaVersion': 1, 'baseSourceSha256': report['sourceSha256'],
                        'evidence': [{'id': 'E', 'path': 'evidence.txt', 'sha256': sha(raw), 'startLine': 1, 'endLine': 1, 'quote': raw.decode()}],
                        'changes': [{'target': 'P::Root/duty/motor', 'before': 'part motor;', 'after': 'part actuator;',
                                     'reason': 'Supplied proposed naming change', 'evidenceIds': ['E']}]}
            with self.assertRaisesRegex(ValueError, 'every use'):
                candidate(report, source, proposal, base)
            proposal['changes'][0]['editScope'] = 'shared-source-element'
            value, receipt = candidate(report, source, proposal, base)
            self.assertIn('part actuator;', value)
            self.assertEqual(receipt['changes'][0]['editScope'], 'shared-source-element')
            self.assertEqual(receipt['status'], 'proposed-not-validated')


if __name__ == '__main__': unittest.main()
