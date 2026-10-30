import unittest
import copy
from check_contract import check_contract


class ContractSchemaTests(unittest.TestCase):
    def setUp(self):
        self.report = {'staticChecksPassed': True, 'elements': [
            {'sessionElementId': 'x', 'metaclass': 'PartUsage', 'qualifiedName': 'System::pump',
             'semantics': {'isComposite': True}}]}
        self.contract = {'schemaVersion': 1, 'checks': [
            {'id': 'pump', 'select': {'qualifiedName': 'System::pump'},
             'expect': {'semanticFields': {'isComposite': True}}}]}

    def test_typo_cannot_silently_reduce_assertion_to_existence(self):
        check = self.contract['checks'][0]
        check['expects'] = {'semanticFields': {'isComposite': False}}
        del check['expect']
        with self.assertRaises(ValueError):
            check_contract(self.report, self.contract)

    def test_unknown_expectation_rejected_even_without_candidates(self):
        check = self.contract['checks'][0]
        check.update(select={'qualifiedName': 'missing'}, count=0, expect={'literalValue': 999})
        with self.assertRaises(ValueError):
            check_contract(self.report, self.contract)

    def test_boolean_or_negative_count_is_not_cardinality(self):
        for value in (True, -1, '1'):
            with self.subTest(value=value):
                self.contract['checks'][0]['count'] = value
                with self.assertRaises(ValueError):
                    check_contract(self.report, self.contract)

    def test_existence_and_absence_contracts_remain_supported(self):
        del self.contract['checks'][0]['expect']
        self.assertTrue(check_contract(self.report, self.contract)['passed'])
        self.contract['checks'][0].update(select={'qualifiedName': 'missing'}, count=0)
        self.assertTrue(check_contract(self.report, self.contract)['passed'])

    def test_unknown_semantic_field_is_not_equal_to_absent_none(self):
        self.contract['checks'][0]['expect'] = {'semanticFields': {'inventedProperty': None}}
        self.assertFalse(check_contract(self.report, self.contract)['passed'])

    def test_static_failure_string_is_not_success(self):
        self.report['staticChecksPassed'] = 'false'
        self.assertFalse(check_contract(self.report, self.contract)['passed'])

    def test_empty_text_and_null_reference_expectations_rejected(self):
        for expected in ({'sourceIncludes': []}, {'references': {'referent': None}},
                         {'referenceTargets': {'ownedElement': ''}}):
            with self.subTest(expected=expected):
                self.contract['checks'][0]['expect'] = expected
                with self.assertRaises(ValueError):
                    check_contract(self.report, self.contract)

    def test_binding_endpoints_ignore_order_but_preserve_multiplicity(self):
        self.report['elements'][0]['semantics']['relatedFeature'] = [
            {'id': 'b', 'qualifiedName': 'System::controller::enable'},
            {'id': 'a', 'qualifiedName': 'System::enable'}]
        self.contract['checks'][0]['expect'] = {'endpointsUnordered': [
            ['System::enable'], ['System::controller::enable']]}
        self.assertTrue(check_contract(self.report, self.contract)['passed'])
        self.report['elements'][0]['semantics']['relatedFeature'][0] = {'id': 'a', 'qualifiedName': 'System::enable'}
        self.assertFalse(check_contract(self.report, self.contract)['passed'])

    def test_candidate_cardinality_precedes_expectation_filtering(self):
        duplicate = copy.deepcopy(self.report['elements'][0])
        duplicate['sessionElementId'] = 'x2'
        duplicate['semantics']['isComposite'] = False
        self.report['elements'].append(duplicate)
        self.contract['checks'][0]['candidateCount'] = 1
        result = check_contract(self.report, self.contract)
        self.assertFalse(result['passed'])
        self.assertEqual(result['checks'][0]['matchedCount'], 1)
        self.assertEqual(result['checks'][0]['candidateCount'], 2)

    def test_contract_schema_version_is_integer(self):
        self.contract['schemaVersion'] = True
        with self.assertRaises(ValueError):
            check_contract(self.report, self.contract)


if __name__ == '__main__':
    unittest.main()
