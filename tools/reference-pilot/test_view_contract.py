import copy
import unittest
from acceptance_suite import check_views


class ViewConcernTests(unittest.TestCase):
    def setUp(self):
        self.views = [
            {'id': 'context', 'targets': ['CoolerStudy::context'], 'view': 'INTERCONNECTION', 'notationProfile': 'bounded', 'excluded': []},
            {'id': 'parts', 'targets': ['CoolerStudy::Cooler'], 'view': 'TREE'},
            {'id': 'wiring', 'targets': ['CoolerStudy::Cooler'], 'view': 'INTERCONNECTION', 'notationProfile': 'bounded', 'excluded': []},
            {'id': 'behavior', 'targets': ['CoolerStudy::Regulate'], 'view': 'ACTION'},
            {'id': 'requirements', 'targets': ['CoolerStudy::capacityRequirement'], 'view': 'TREE'},
            {'id': 'verification', 'targets': ['CoolerStudy::CapacityVerification'], 'view': 'TREE'},
        ]

        for view in self.views:
            view['modelSha256'] = 'fixture-revision'

    def report(self):
        return {'views': self.views, 'sourceSha256': 'fixture-revision'}

    def test_mixed_revision_is_rejected(self):
        self.views[-1]['modelSha256'] = 'older-revision'
        self.assertFalse(check_views(self.report()))

    def test_six_correct_concerns_pass_regardless_of_order(self):
        self.views.reverse()
        self.assertTrue(check_views(self.report()))

    def test_six_views_cannot_substitute_duplicate_for_missing_concern(self):
        self.views[-1] = copy.deepcopy(self.views[-2])
        self.views[-1]['id'] = 'fake-verification'
        self.assertFalse(check_views(self.report()))

    def test_wrong_mode_or_missing_projection_does_not_pass(self):
        self.views[3]['view'] = 'TREE'
        self.assertFalse(check_views(self.report()))

    def test_duplicate_artifact_ids_and_projection_omissions_fail(self):
        self.views[-1]['id'] = 'requirements'
        self.assertFalse(check_views(self.report()))
        self.views[-1]['id'] = 'verification'
        self.views[0]['excluded'] = [{'id': 'connection', 'reason': 'unsupported'}]
        self.assertFalse(check_views(self.report()))


if __name__ == '__main__':
    unittest.main()
