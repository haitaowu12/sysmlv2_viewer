import unittest
from unittest.mock import patch
from capacity_analysis import analyze

class CapacityAnalysisTests(unittest.TestCase):
    def report(self):
        return {'staticChecksPassed': True, 'sourceSha256': 'model', 'elements': [
            {'sessionElementId': 'count', 'qualifiedName': 'S::count'},
            {'sessionElementId': 'constraint', 'metaclass': 'ConstraintUsage', 'semantics': {'owner': {'qualifiedName': 'R'}}}]}

    def evaluate(self, value=2, threshold=3, **changes):
        value_fact = dict(metaclass='AttributeUsage', types=['ScalarValues::Integer'], literalValues=[value])
        expr = {'operator': '>=', 'operands': [{'kind': 'FeaturePath', 'path': ['R::s', 'S::count']}, {'kind': 'LiteralInteger', 'value': threshold}]}
        expr.update(changes)
        with patch('capacity_analysis.facts', side_effect=[value_fact, {'expression': expr}]):
            return analyze(self.report(), 'S::count', 'R')

    def test_boundaries(self):
        for value, expected in [(2, False), (3, True), (4, True)]:
            self.assertEqual(self.evaluate(value)['comparisonResult'], expected)
    def test_missing_bool_and_out_of_range_are_unsupported(self):
        for value in (None, True, -1, 9007199254740992):
            self.assertEqual(self.evaluate(value)['status'], 'unsupported')
    def test_unknown_operator_is_not_evaluated(self):
        self.assertEqual(self.evaluate(operator='mystery')['status'], 'unsupported')
    def test_invalid_model_is_not_analyzed(self):
        report = self.report(); report['staticChecksPassed'] = False
        self.assertEqual(analyze(report, 'S::count', 'R')['status'], 'unsupported')

if __name__ == '__main__': unittest.main()
