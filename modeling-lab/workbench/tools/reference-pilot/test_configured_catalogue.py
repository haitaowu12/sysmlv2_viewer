"""Configured-scope fallback preserves budgets and explicit evidence boundaries."""
import copy
import unittest
from unittest.mock import patch
from view_scope import catalogue, catalogue_for_views, ExplorationBudgetError, LIMITS, select
from test_engineering import element, ref


def report():
    leaves=[element('leaf'+str(i),'PartUsage','leaf'+str(i),feature=[]) for i in range(4)]
    big=element('big','PartDefinition','Big',feature=[ref(e) for e in leaves])
    small=element('small','PartDefinition','Small',feature=[])
    requirement=element('req','RequirementUsage','Need')
    assertion=element('assert','SatisfyRequirementUsage','assertion',satisfyingFeature=ref(leaves[0]),satisfiedRequirement=ref(requirement),isNegated=False)
    for leaf in leaves:leaf['semantics']['owner']={'id':'big','metaclass':'PartDefinition'}
    return {'staticChecksPassed':True,'sourceSha256':'fixture','elements':[big,small,*leaves,requirement,assertion]}


class ConfiguredCatalogueTests(unittest.TestCase):
    def test_global_success_returns_the_existing_complete_catalogue(self):
        r=report()
        self.assertEqual(catalogue_for_views(r,[{'names':['P::Small']}]),catalogue(r))
        self.assertNotIn('coverage',catalogue_for_views(r,[{'names':['P::Small']}]))

    def test_global_budget_failure_uses_only_explicit_scopes_and_keeps_global_trace_inventory(self):
        r=report();before=copy.deepcopy(r)
        with patch.dict(LIMITS,{'occurrences':3}):
            with self.assertRaises(ExplorationBudgetError):catalogue(r)
            c=catalogue_for_views(r,[{'names':['P::Small']},{'names':['P::Small']}])
        self.assertEqual(c['roots'],['P::Small'])
        self.assertEqual([n['elementId'] for n in c['nodes']],['small'])
        self.assertEqual(c['coverage']['mode'],'configured-part-scopes')
        self.assertEqual(c['coverage']['excludedRootCount'],1)
        self.assertFalse(c['coverage']['globalAvailable'])
        self.assertIn('2000-occurrence',c['coverage']['globalUnavailableReason'])
        self.assertEqual([q['elementId'] for q in c['requirements']],['req'])
        self.assertEqual(c['traces'][0]['sourceOccurrences'],[])
        self.assertTrue(any('no scoped coverage inferred' in w['reason'] for w in c['warnings']))
        self.assertIn('not evidence',c['coverage']['traceabilityLimit'])
        q={'schemaVersion':1,'root':'P::Small','focus':'P::Small','depth':0}
        self.assertEqual(select(c,q)['coverage'],c['coverage'])
        self.assertEqual(r,before)

    def test_unknown_ambiguous_nonpart_and_malformed_configured_targets_fail_closed(self):
        r=report()
        with patch.dict(LIMITS,{'occurrences':3}):
            for views in ([{'names':['P::Unknown']}],[{'names':['P::Need']}],[],[{'names':[]}],[{'names':['P::Small','P::Big']}],None):
                with self.subTest(views=views),self.assertRaises(ValueError):catalogue_for_views(r,views)
            duplicate=copy.deepcopy(r['elements'][1]);duplicate['sessionElementId']='other-small';r['elements'].append(duplicate)
            with self.assertRaises(ValueError):catalogue_for_views(r,[{'names':['P::Small']}])

    def test_only_budget_errors_enable_fallback_and_configured_budget_is_unchanged(self):
        with patch('view_scope.catalogue',side_effect=ValueError('Unrelated source failure')) as build:
            with self.assertRaisesRegex(ValueError,'Unrelated source failure'):
                catalogue_for_views(report(),[{'names':['P::Small']}])
            self.assertEqual(build.call_count,1)
        with patch.dict(LIMITS,{'occurrences':3}):
            with self.assertRaises(ExplorationBudgetError):catalogue_for_views(report(),[{'names':['P::Big']}])
        with self.assertRaises(ValueError):catalogue(report(),roots=[])
        with self.assertRaises(ValueError):catalogue(report(),roots=['P::Unknown'])
        with self.assertRaises(ValueError):catalogue({**report(),'staticChecksPassed':False},roots=['P::Small'])

if __name__=='__main__':unittest.main()
