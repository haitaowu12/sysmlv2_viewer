import unittest
from unittest.mock import patch
from change_summary import summarize, count_wording


class ChangeSummaryTests(unittest.TestCase):
    def test_requirement_changes_without_inventing_more_equipment(self):
        old = {'status': 'declared-comparison-passed', 'declaredValue': 2, 'requiredMinimum': 2, 'attribute': 'S::count'}
        new = {**old, 'status': 'declared-design-shortfall', 'requiredMinimum': 3}
        with patch('change_summary.comparisons', side_effect=[{'R': old}, {'R': new}]):
            result = summarize({'sourceSha256': 'old'}, {'sourceSha256': 'new'})[0]
        self.assertEqual(result['text'], 'Required minimum: 2 → 3. Declared count: 2 (unchanged).')
        self.assertEqual(result['physicalVerification'], 'not-evaluated')
        self.assertIn('shortfall', result['consequence'])
        self.assertEqual(result['baselineSourceSha256'], 'old')

    def test_unsupported_or_removed_obligation_has_no_numeric_conclusion(self):
        old = {'status': 'declared-comparison-passed', 'declaredValue': 2, 'requiredMinimum': 2}
        for new in ({'status': 'unsupported', 'constraintKind': 'assumption'}, None):
            with self.subTest(new=new), patch('change_summary.comparisons', side_effect=[{'R': old}, {'R': new} if new else {}]):
                result = summarize({'sourceSha256': 'old'}, {'sourceSha256': 'new'})[0]
                self.assertIn('unavailable or unsupported', result['consequence'])
                self.assertNotIn('minimum', result['text'])

    def test_documentary_count_noun_requires_matching_unambiguous_source(self):
        report = lambda text: {'elements': [{'qualifiedName': 'R', 'source': 'requirement r { doc /* '+text+' */ }'}]}
        self.assertEqual(count_wording(report('Retain at least three samples.'), 'R', 3), 'samples')
        for text in ('Retain at least two samples.', 'Do not retain at least three samples.',
                     'Retain at least three samples; retain at least three units.',
                     'Retain at least three samples unless bypassed.', 'Retain samples.'):
            with self.subTest(text=text):
                self.assertIsNone(count_wording(report(text), 'R', 3))

    def test_sample_label_comes_from_both_source_revisions_and_preserves_numeric_facts(self):
        old = {'status': 'declared-comparison-passed', 'declaredValue': 2, 'requiredMinimum': 2, 'attribute': 'S::sampleCapacity'}
        new = {**old, 'status': 'declared-design-shortfall', 'requiredMinimum': 3}
        baseline = {'sourceSha256': 'old', 'elements': [{'qualifiedName': 'R', 'source': 'requirement r { doc /* Retain at least two samples. */ }'}]}
        current = {'sourceSha256': 'new', 'elements': [{'qualifiedName': 'R', 'source': 'requirement r { doc /* Retain at least three samples. */ }'}]}
        with patch('change_summary.comparisons', side_effect=[{'R': old}, {'R': new}]):
            result = summarize(baseline, current)[0]
        self.assertEqual(result['quantityLabel'], 'Sample capacity')
        self.assertEqual(result['countWording'], 'samples')
        self.assertIn('Declared sample capacity (samples): 2 (unchanged)', result['text'])
        self.assertIn('Count label quoted from requirement wording.', result['text'])
        self.assertEqual(result['after'], new)
        current['elements'][0]['source'] = 'doc /* Retain at least three channels. */'
        with patch('change_summary.comparisons', side_effect=[{'R': old}, {'R': new}]):
            self.assertIsNone(summarize(baseline, current)[0]['countWording'])

    def test_changed_quantity_identity_does_not_relabel_an_old_value_as_the_new_quantity(self):
        old = {'status': 'declared-comparison-passed', 'declaredValue': 2, 'requiredMinimum': 2, 'attribute': 'S::sampleCapacity'}
        new = {**old, 'attribute': 'S::channelCapacity', 'requiredMinimum': 3}
        with patch('change_summary.comparisons', side_effect=[{'R': old}, {'R': new}]):
            result = summarize({'sourceSha256': 'old'}, {'sourceSha256': 'new'})[0]
        self.assertEqual(result['text'], 'The basis for this declaration comparison changed.')
        self.assertNotIn('2 → 3', result['text'])

    def test_no_baseline_does_not_invent_a_change(self):
        self.assertEqual(summarize(None, {'sourceSha256': 'new'}), [])


if __name__ == '__main__': unittest.main()
