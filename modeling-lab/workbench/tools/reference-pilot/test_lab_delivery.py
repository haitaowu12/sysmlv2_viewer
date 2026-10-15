import copy
import unittest
from lab_delivery import browser_report, element_detail


class LabDeliveryTests(unittest.TestCase):
    def setUp(self):
        self.report = {'staticChecksPassed': True, 'sourceSha256': 'source',
                       'reportIntegrity': {'reportSha256': 'qualified'}, 'source': 'unchanged source',
                       'elements': [
                           {'sessionElementId': 'named', 'qualifiedName': 'Study::part', 'source': 'part body', 'semantics': {'type': [{'id': 'target'}]}},
                           {'sessionElementId': 'link', 'metaclass': 'ConnectionUsage', 'source': 'connect a to b;', 'semantics': {'source': {'id': 'a'}}},
                           {'sessionElementId': 'perform', 'metaclass': 'PerformActionUsage', 'source': 'perform action;', 'semantics': {'type': [{'id': 'scenario'}]}},
                           {'sessionElementId': 'anonymous', 'metaclass': 'FeatureMembership', 'source': 'exact anonymous witness'}],
                       'catalogue': {'relations': [{'elementId': 'link'}], 'nodes': [], 'traces': [], 'requirements': []},
                       'views': [{'svg': 'unchanged SVG'}], 'diagnostics': []}

    def test_inventory_preserves_editing_targets_reader_witnesses_and_full_report(self):
        before = copy.deepcopy(self.report)
        view = browser_report(self.report)
        self.assertEqual({e['sessionElementId'] for e in view['elements']}, {'named', 'link', 'perform'})
        self.assertEqual(view['elements'][0], before['elements'][0])
        self.assertEqual(view['elements'][1]['source'], 'connect a to b;')
        self.assertEqual(view['elements'][2], before['elements'][2])
        self.assertEqual(view['source'], before['source'])
        self.assertEqual(view['views'], before['views'])
        self.assertEqual(view['catalogue'], before['catalogue'])
        self.assertEqual(view['delivery']['fullElementCount'], 4)
        self.assertEqual(self.report, before)

    def test_deferred_witness_is_exact_and_rejects_other_source_report_or_element(self):
        req = {'sourceSha256': 'source', 'reportSha256': 'qualified', 'elementId': 'anonymous'}
        self.assertEqual(element_detail(self.report, req)['element'], self.report['elements'][3])
        for changes in ({'sourceSha256': 'stale'}, {'reportSha256': 'other report'}, {'elementId': 'unknown'}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                element_detail(self.report, dict(req, **changes))
        with self.assertRaises(ValueError):
            element_detail(None, req)


if __name__ == '__main__':
    unittest.main()
