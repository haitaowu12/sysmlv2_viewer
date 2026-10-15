"""Accepted model context protocol: rejected/stale candidates never replace it."""
import unittest
from lab import AcceptedState


def state(source, report='report', baseline='baseline'):
    return {'report': {'sourceSha256': source, 'reportIntegrity': {'reportSha256': report}},
            'catalogue': {'source': source}, 'views': [source], 'baseline': baseline}


class AcceptedProjectTransactions(unittest.TestCase):
    def setUp(self):
        self.current = state('old')
        self.protocol = AcceptedState(self.current)

    def accept(self, token='project-1', source='new', report='report'):
        return self.protocol.accept({'transactionId': token, 'sourceSha256': source, 'reportSha256': report})

    def test_staging_leaves_all_accepted_context_unchanged_then_accepts_together(self):
        self.protocol.stage('project-1', state('new', baseline='new baseline'), ('old', 'report'))
        self.assertEqual(self.current, state('old'))
        self.assertTrue(self.accept()['accepted'])
        self.assertEqual(self.current, state('new', baseline='new baseline'))

    def test_rollback_restores_report_baseline_views_and_catalogue_together(self):
        self.protocol.stage('project-1', state('new', baseline='new baseline'), ('old', 'report'))
        self.accept()
        self.protocol.rollback('project-1')
        self.assertEqual(self.current, state('old'))

    def test_source_and_report_receipt_both_must_match(self):
        self.protocol.stage('project-1', state('new'), ('old', 'report'))
        for source, report in [('unrelated', 'report'), ('new', 'unrelated')]:
            with self.subTest(source=source, report=report), self.assertRaisesRegex(ValueError, 'match'):
                self.accept(source=source, report=report)
            self.assertEqual(self.current, state('old'))

    def test_superseded_same_hash_candidate_cannot_be_accepted_from_another_project(self):
        self.protocol.stage('project-1', state('new'), ('old', 'report'))
        self.protocol.stage('project-2', state('new'), ('old', 'report'))
        with self.assertRaisesRegex(ValueError, 'no longer current'):
            self.accept('project-1')
        self.assertEqual(self.current, state('old'))
        self.accept('project-2')
        self.assertEqual(self.current, state('new'))

    def test_changed_accepted_identity_rejects_staging_and_acceptance(self):
        with self.assertRaisesRegex(ValueError, 'changed'):
            self.protocol.stage('project-1', state('new'), ('old', 'wrong report'))
        self.protocol.stage('project-1', state('new'), ('old', 'report'))
        self.current.update(state('unrelated'))
        with self.assertRaisesRegex(ValueError, 'match'):
            self.accept()
        self.assertEqual(self.current, state('unrelated'))

    def test_only_last_acceptance_can_be_rolled_back_with_repeat_confirmation(self):
        self.protocol.stage('project-1', state('new'), ('old', 'report')); self.accept()
        self.protocol.stage('project-2', state('newer'), ('new', 'report')); self.accept('project-2', 'newer')
        with self.assertRaises(ValueError): self.protocol.rollback('project-1')
        self.protocol.rollback('project-2')
        self.assertEqual(self.current, state('new'))
        self.assertEqual(self.protocol.rollback('project-2'), {'rolledBack': True, 'transactionId': 'project-2'})
        self.assertEqual(self.current, state('new'))

    def test_initial_empty_project_is_bound_to_empty_identity(self):
        current = {'report': None, 'catalogue': None, 'views': [], 'baseline': None}
        protocol = AcceptedState(current)
        protocol.stage('initial-1', state('initial'), (None, None))
        protocol.accept({'transactionId': 'initial-1', 'sourceSha256': 'initial', 'reportSha256': 'report'})
        protocol.rollback('initial-1')
        self.assertIsNone(current['report']); self.assertIsNone(current['baseline'])

    def test_unaccepted_stage_can_be_aborted_and_confirmation_retried(self):
        self.protocol.stage('project-1', state('new'), ('old', 'report'))
        expected = {'rolledBack': True, 'transactionId': 'project-1'}
        self.assertEqual(self.protocol.rollback('project-1'), expected)
        self.assertEqual(self.protocol.rollback('project-1'), expected)
        self.assertIsNone(self.protocol.staged)
        self.assertEqual(self.current, state('old'))
        with self.assertRaises(ValueError): self.accept()

    def test_unknown_or_superseded_token_never_changes_another_transaction(self):
        self.protocol.stage('project-1', state('new'), ('old', 'report'))
        self.protocol.stage('project-2', state('newer'), ('old', 'report'))
        staged = self.protocol.staged
        for token in ('unknown-1', 'project-1', None):
            with self.subTest(token=token), self.assertRaises(ValueError): self.protocol.rollback(token)
            self.assertIs(self.protocol.staged, staged)
            self.assertEqual(self.current, state('old'))
        self.accept('project-2', 'newer')
        previous = self.protocol.previous
        with self.assertRaises(ValueError): self.protocol.rollback('project-1')
        self.assertIs(self.protocol.previous, previous)
        self.assertEqual(self.current, state('newer'))

    def test_next_acceptance_clears_last_rollback_confirmation(self):
        self.protocol.stage('project-1', state('new'), ('old', 'report')); self.accept()
        self.protocol.rollback('project-1')
        self.protocol.stage('project-2', state('newer'), ('old', 'report')); self.accept('project-2', 'newer')
        self.assertIsNone(self.protocol.last_rolled_back)
        with self.assertRaises(ValueError): self.protocol.rollback('project-1')
        self.assertEqual(self.current, state('newer'))
        self.protocol.rollback('project-2')
        self.assertEqual(self.protocol.last_rolled_back, 'project-2')
        with self.assertRaises(ValueError): self.protocol.rollback('project-1')
        self.assertEqual(self.current, state('old'))

    def test_discarding_stage_preserves_prior_acceptance_and_its_rollback(self):
        self.protocol.stage('project-1', state('new'), ('old', 'report')); self.accept()
        previous = self.protocol.previous
        self.protocol.stage('project-2', state('newer'), ('new', 'report'))
        self.protocol.rollback('project-2')
        self.assertEqual(self.current, state('new'))
        self.assertIs(self.protocol.previous, previous)
        self.protocol.rollback('project-1')
        self.assertEqual(self.current, state('old'))


if __name__ == '__main__': unittest.main()


class RequiredNativeViews(unittest.TestCase):
    def test_all_required_recipes_need_matching_scope_and_both_audience_drawings(self):
        from lab import require_complete_views
        recipe = {'id': 'overview', 'names': ['Study::System']}
        good = {'id': 'overview', 'targets': recipe['names'], 'svg': '<svg/>', 'stakeholderSvg': '<svg/>'}
        require_complete_views({'views': [good]}, [recipe])
        for change in ({'error': 'Missing target'}, {'stakeholderError': 'Projection failed'}, {'svg': ''}, {'stakeholderSvg': ''}, {'targets': ['Wrong::Scope']}):
            with self.subTest(change=change), self.assertRaisesRegex(ValueError, 'Required view overview'):
                require_complete_views({'views': [{**good, **change}]}, [recipe])
        with self.assertRaisesRegex(ValueError, 'missing'):
            require_complete_views({'views': []}, [recipe])

    def test_unknown_evidence_warning_is_distinct_from_failed_render(self):
        from lab import require_complete_views
        recipe = {'id': 'state', 'names': ['Study::State']}
        require_complete_views({'views': [{'id': 'state', 'targets': recipe['names'], 'svg': '<svg/>', 'stakeholderSvg': '<svg/>', 'behavior': {'warnings': ['Guard evidence unavailable']}}]}, [recipe])
