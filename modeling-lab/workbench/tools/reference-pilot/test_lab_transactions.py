"""Accepted model context protocol: rejected/stale candidates never replace it."""
import unittest
from lab import AcceptedState, initial_payload


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


class NativeInitialPayload(unittest.TestCase):
    def test_fresh_context_bootstraps_startup_source_views_and_empty_identity(self):
        from lab_project import digest
        presets = [{'id': 'startup'}]
        current = {'report': None, 'catalogue': None, 'views': presets, 'baseline': None}
        payload = initial_payload(current, 'startup source', presets, 'original workspace')
        self.assertEqual(payload, {'source': 'startup source', 'presets': presets,
            'baselineSource': 'startup source', 'baselineHash': digest('startup source'),
            'acceptedReport': None, 'workspaceKey': 'original workspace'})
        payload['presets'].append({'id': 'client edit'})
        self.assertEqual(current['views'], [{'id': 'startup'}])

    def test_resumed_context_retains_baseline_saved_views_and_exact_identity(self):
        current = state('accepted hash', report='accepted report hash')
        current['report']['source'] = 'accepted changed source'
        current['baseline'] = {'source': 'original baseline source', 'sourceSha256': 'original baseline hash'}
        current['views'] = [{'id': 'saved view'}]
        payload = initial_payload(current, 'obsolete startup source', [{'id': 'obsolete'}], 'original workspace')
        self.assertEqual(payload['source'], 'accepted changed source')
        self.assertEqual(payload['presets'], [{'id': 'saved view'}])
        self.assertEqual(payload['baselineSource'], 'original baseline source')
        self.assertEqual(payload['baselineHash'], 'original baseline hash')
        self.assertEqual(payload['acceptedReport'], {'sourceSha256': 'accepted hash', 'reportIntegrity': {'reportSha256': 'accepted report hash'}})
        self.assertEqual(payload['workspaceKey'], 'original workspace')
        protocol = AcceptedState(current)
        identity = payload['acceptedReport']
        expected = (identity['sourceSha256'], identity['reportIntegrity']['reportSha256'])
        protocol.stage('resumed-1', state('next'), expected)
        with self.assertRaisesRegex(ValueError, 'changed'):
            protocol.stage('stale-000', state('wrong'), ('obsolete hash', 'obsolete report'))
        self.assertEqual(protocol.staged[0], 'resumed-1')

    def test_bootstrap_does_not_clear_or_change_any_transaction_state(self):
        import copy
        current = state('old')
        current['report']['source'] = 'old source'
        current['baseline'] = {'source': 'baseline source', 'sourceSha256': 'baseline hash'}
        protocol = AcceptedState(current)
        protocol.stage('project-1', state('new'), ('old', 'report'))
        protocol.accept({'transactionId': 'project-1', 'sourceSha256': 'new', 'reportSha256': 'report'})
        protocol.stage('project-2', state('candidate'), ('new', 'report'))
        protocol.rollback('project-2')
        protocol.stage('project-3', state('candidate'), ('new', 'report'))
        before = copy.deepcopy(protocol.__dict__)
        staged, previous, accepted = protocol.staged, protocol.previous, protocol.current
        initial_payload(current, 'startup', [], 'workspace')
        self.assertEqual(protocol.__dict__, before)
        self.assertIs(protocol.staged, staged)
        self.assertIs(protocol.previous, previous)
        self.assertIs(protocol.current, accepted)
        self.assertEqual(protocol.last_rolled_back, 'project-2')
