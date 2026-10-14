import unittest
from lab_project import candidate, digest, views_for


class LabProjectTests(unittest.TestCase):
    def setUp(self):
        self.requirement = 'requirement capacity { doc /* At least two units. */ subject plant : Plant; require constraint { plant.count >= 2 } }'
        self.part = 'part def Plant { attribute count : Integer = 2; part duty; part reserve; }'
        self.source = 'package DifferentPlant {\n'+self.part+'\n'+self.requirement+'\n}'
        self.report = {'staticChecksPassed': True, 'sourceSha256': digest(self.source), 'elements': [
            {'qualifiedName': 'DifferentPlant', 'metaclass': 'Package', 'source': self.source},
            {'qualifiedName': 'DifferentPlant::Plant', 'metaclass': 'PartDefinition', 'source': self.part},
            {'qualifiedName': 'DifferentPlant::capacity', 'metaclass': 'RequirementUsage', 'source': self.requirement}]}
        self.base = {'baseSourceSha256': digest(self.source), 'reason': 'Fictional exercise decision; proposed for review.'}

    def test_minimum_changes_statement_and_constraint_but_preserves_design(self):
        result, receipt = candidate(self.report, self.source, dict(self.base, operation='minimum', target='DifferentPlant::capacity', value=3, statement='At least three units.'))
        self.assertIn(self.part, result)
        self.assertIn('At least three units.', result)
        self.assertIn('plant.count >= 3', result)
        self.assertEqual(receipt['baseSourceSha256'], digest(self.source))

    def test_rejects_stale_ambiguous_unsupported_and_malicious_input(self):
        request = dict(self.base, operation='minimum', target='DifferentPlant::capacity', value=3, statement='Three units.')
        for changes in ({'baseSourceSha256': 'stale'}, {'target': 'missing'}, {'value': -1}, {'value': 3.2}, {'statement': '*/ part surprise; /*'}, {'reason': ''}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                candidate(self.report, self.source, dict(request, **changes))
        duplicate = self.source.replace(self.requirement, self.requirement+'\n'+self.requirement)
        report = dict(self.report, sourceSha256=digest(duplicate))
        with self.assertRaisesRegex(ValueError, 'ambiguous'):
            candidate(report, duplicate, dict(request, baseSourceSha256=digest(duplicate)))

    def test_develops_sequence_without_inventing_execution(self):
        result, receipt = candidate(self.report, self.source, dict(self.base, operation='scenario', target='DifferentPlant', name='RecoverService', description='Proposed recovery scenario.', steps=[{'name': 'request', 'description': 'Operator requests recovery.'}, {'name': 'respond', 'description': 'System responds; safeguards unspecified.'}]))
        self.assertIn('first start;', result)
        self.assertIn('then action request', result)
        self.assertIn('then action respond', result)
        self.assertIn(self.part, result)
        self.assertIn('execution remain unspecified', receipt['description'])
        with self.assertRaises(ValueError):
            candidate(self.report, self.source, dict(self.base, operation='scenario', target='DifferentPlant', name='Bad', description='Proposal.', steps=[{'name': 'same', 'description': 'A'},{'name': 'same', 'description': 'B'}]))

    def test_component_and_responsibility_use_selected_scope(self):
        result, _ = candidate(self.report, self.source, dict(self.base, operation='component', target='DifferentPlant::Plant', name='monitor', description='Proposed monitoring responsibility.'))
        self.assertIn('part monitor', result)
        self.assertIn(self.requirement, result)
        action = {'qualifiedName': 'DifferentPlant::RecoverService', 'metaclass': 'ActionDefinition', 'source': 'action def RecoverService;'}
        report = dict(self.report, elements=self.report['elements']+[action])
        result, _ = candidate(report, self.source, dict(self.base, operation='responsibility', target='DifferentPlant::Plant', action=action['qualifiedName'], name='recover'))
        self.assertIn('perform action recover : DifferentPlant::RecoverService;', result)

    def test_view_admission_rejects_duplicates_and_unknown_renderers(self):
        view = {'id': 'overview', 'names': ['DifferentPlant::Plant'], 'view': 'TREE', 'styles': []}
        self.assertEqual(views_for([view]), [view])
        for views in ([view, view], [dict(view, renderer='custom-executable')], [dict(view, names=[])], [dict(view, styles=['arbitrary'])]):
            with self.assertRaises(ValueError): views_for(views)


if __name__ == '__main__': unittest.main()
