"""Typed reference contexts remain distinct from owned physical occurrences."""
import copy
import unittest
from view_scope import catalogue, compose, catalogue_for_views
from test_engineering import element, ref


def fixture():
    stage=element('stage','PartUsage','stage1',feature=[])
    launch=element('launch','PartUsage','launchVehicle',feature=[ref(stage)])
    system=element('system','PartDefinition','System',feature=[ref(launch)])
    launch['semantics']['owner']={'id':'system','metaclass':'PartDefinition'}
    stage['semantics']['owner']={'id':'launch','metaclass':'PartUsage'}
    subject=element('subject','ReferenceUsage','reviewSubject',type=[ref(system)],feature=[ref(launch)],isComposite=False,isReference=True)
    other=element('other','ReferenceUsage','otherSubject',type=[ref(system)],feature=[ref(launch)],isComposite=False,isReference=True)
    requirement=element('requirement','RequirementUsage','clr-R001')
    assertion=element('assertion','SatisfyRequirementUsage','assertion',satisfyingFeature=ref(stage),satisfiedRequirement=ref(requirement),
                      satisfyingFeatureChain=[ref(subject),ref(launch),ref(stage)],isNegated=False)
    return {'staticChecksPassed':True,'sourceSha256':'fixture','elements':[system,launch,stage,subject,other,requirement,assertion]}


class ReferenceRootCatalogueTests(unittest.TestCase):
    def test_reference_root_preserves_metaclass_identity_context_and_exact_assertion_path(self):
        r=fixture();before=copy.deepcopy(r);c=catalogue(r)
        root=next(n for n in c['nodes'] if n['elementId']=='subject' and n['parent'] is None)
        self.assertEqual(root['metaclass'],'ReferenceUsage')
        self.assertTrue(root['referenceRoot']);self.assertTrue(root['referenced'])
        self.assertEqual(root['root'],'P::reviewSubject')
        assertion=next(t for t in c['traces'] if t['elementId']=='assertion')
        self.assertEqual(assertion['sourceOccurrences'],['P::reviewSubject/launchVehicle/stage1'])
        self.assertNotIn('P::System/launchVehicle/stage1',assertion['sourceOccurrences'])
        self.assertTrue(any(w.get('elementId')=='subject' and 'not an additional owned component' in w['reason'] for w in c['warnings']))
        selected=catalogue(r,roots=['P::reviewSubject'])
        self.assertEqual(selected['roots'],['P::reviewSubject'])
        self.assertEqual({n['elementId'] for n in selected['nodes']},{'subject','launch','stage'})
        self.assertEqual(r,before)

    def test_selection_and_graph_propagate_reference_identity_without_promoting_type(self):
        c=catalogue(fixture(),roots=['P::reviewSubject'])
        result=compose(c,{'schemaVersion':1,'root':'P::reviewSubject','focus':'P::reviewSubject','depth':1})
        root=next(n for n in result['nodes'] if n['parent'] is None)
        self.assertTrue(root['referenced'])
        self.assertIn('Referenced context',result['svg'])
        self.assertTrue(any(source['elementId']=='subject' for source in result['graphSources'].values()))
        self.assertFalse(any(source['elementId']=='system' for source in result['graphSources'].values()))

    def test_reference_types_must_resolve_to_exactly_one_part_definition(self):
        for typing in ([],[{'id':'missing'}],[{'id':'system'},{'id':'different'}],[{'id':'requirement'}],None,'System'):
            r=fixture();subject=r['elements'][3];subject['semantics']['type']=typing
            r['elements'].append(element('different','PartDefinition','Different',feature=[]))
            with self.subTest(typing=typing):
                c=catalogue(r)
                self.assertFalse(any(n['elementId']=='subject' for n in c['nodes']))
                self.assertEqual(next(t for t in c['traces'] if t['elementId']=='assertion')['sourceOccurrences'],[])
                with self.assertRaises(ValueError):catalogue(r,roots=['P::reviewSubject'])

    def test_reference_root_is_not_promoted_to_a_child_component(self):
        r=fixture();r['elements'][0]['semantics']['feature'].append(ref(r['elements'][3]))
        c=catalogue(r,roots=['P::System'])
        self.assertEqual({n['elementId'] for n in c['nodes']},{'system','launch','stage'})
        self.assertEqual(catalogue_for_views(r,[{'names':['P::reviewSubject']}]),catalogue(r))

if __name__=='__main__':unittest.main()
