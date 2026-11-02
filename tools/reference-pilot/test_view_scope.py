import copy
import json
import unittest
from unittest.mock import patch
from test_engineering import fixture, element, ref
from view_scope import catalogue, select, compose


def model():
    r=fixture();r['sourceSha256']='a'*64
    # Fixture owners explicitly carry their metaclass like the actual extractor.
    for e in r['elements']:
        if e.get('semantics',{}).get('owner',{}).get('id')=='Root':e['semantics']['owner']['metaclass']='PartDefinition'
    return r


def recipe(**kw):
    return dict(schemaVersion=1,root='P::Root',focus='P::Root/a',depth=0,neighbors=0,kinds=['connection','binding','flow'],hidden=[],pinned=[],**kw)


class ViewScopeTests(unittest.TestCase):
    def test_focus_neighbors_and_boundary_records(self):
        c=catalogue(model());q=recipe();v=select(c,q)
        self.assertEqual([n['key'] for n in v['nodes']],['P::Root/a'])
        self.assertEqual(len(v['crossing']),1);self.assertFalse(v['relations'])
        q['neighbors']=1;v=select(c,q)
        self.assertEqual({n['key'] for n in v['nodes']},{'P::Root/a','P::Root/b'})
        self.assertEqual(len(v['relations']),1);self.assertFalse(v['crossing'])
    def test_hide_and_explicit_include_do_not_change_source(self):
        r=model();original=json.dumps(r,sort_keys=True);c=catalogue(r);q=recipe();q['pinned']=['P::Root/b'];v=select(c,q)
        self.assertEqual(len(v['relations']),1);q['hidden']=['P::Root/b'];v=select(c,q)
        self.assertEqual(len(v['relations']),0);self.assertEqual(len(v['crossing']),1)
        self.assertEqual(original,json.dumps(r,sort_keys=True))
    def test_same_definition_has_distinct_nested_occurrences(self):
        r=model();motor=element('motor','PartUsage','motor',feature=[])
        r['elements'].append(motor)
        for e in r['elements'][1:3]:e['semantics']['feature'].append(ref(motor))
        c=catalogue(r);motors=[n for n in c['nodes'] if n['elementId']=='motor' and n['root']=='P::Root']
        self.assertEqual({n['key'] for n in motors},{'P::Root/a/motor','P::Root/b/motor'})
    def test_missing_saved_locator_blocks_instead_of_broadening(self):
        c=catalogue(model())
        for field in ['focus','root','hidden','pinned']:
            q=recipe();q[field]=['missing'] if field in ['hidden','pinned'] else 'missing'
            with self.assertRaisesRegex(ValueError,'no longer resolves'):select(c,q)
    def test_relation_filter_does_not_invent_direction(self):
        c=catalogue(model());q=recipe();q['neighbors']=1;q['kinds']=['flow']
        v=select(c,q);self.assertEqual(len(v['nodes']),1);self.assertFalse(v['relations'])
        q['pinned']=['P::Root/b'];v=select(c,q);self.assertEqual(v['filteredRelations'],1)
    def test_parallel_relations_are_preserved(self):
        r=model();other=copy.deepcopy(r['elements'][-1]);other['sessionElementId']='c2';r['elements'].append(other);r['elements'][0]['semantics']['feature'].append(ref(other))
        q=recipe();q['neighbors']=1;v=select(catalogue(r),q)
        self.assertEqual(len(v['relations']),2);self.assertEqual(len({x['key'] for x in v['relations']}),2)
    def test_diagram_limit_preserves_table_records(self):
        r=model();root=r['elements'][0]
        for i in range(100):
            c=element(f'x{i}','PartUsage',f'x{i}',feature=[]);c['semantics']['owner']=ref(root);root['semantics']['feature'].append(ref(c));r['elements'].append(c)
        q=recipe();q.update(focus='P::Root',depth=1)
        v=compose(catalogue(r),q);self.assertEqual(len(v['nodes']),103);self.assertIn('diagramError',v);self.assertNotIn('svg',v)
    def test_unknown_endpoint_reported(self):
        r=model();r['elements'][-1]['semantics']['relatedFeature'][0]={'id':'missing'}
        c=catalogue(r);self.assertFalse(c['relations']);self.assertEqual(len(c['warnings']),1)
    def test_invalid_model_and_recipe_rejected(self):
        r=model();r['staticChecksPassed']=False
        with self.assertRaises(ValueError):catalogue(r)
        c=catalogue(model());q=recipe();q['depth']=10
        with self.assertRaises(ValueError):select(c,q)
        q=recipe();q['kinds']=['made-up']
        with self.assertRaises(ValueError):select(c,q)
    def test_explicit_trace_target_and_unlinked_requirement(self):
        r=model();req=element('req','RequirementUsage','required');orphan=element('orphan','RequirementUsage','unlinked')
        satisfy=element('s','SatisfyRequirementUsage','assertion',satisfyingFeature=ref(r['elements'][1]),satisfiedRequirement=ref(req))
        verify=element('v','VerificationCaseDefinition','planned',verifiedRequirement=[ref(req)])
        r['elements'] += [req,orphan,satisfy,verify];c=catalogue(r)
        self.assertEqual({x['elementId'] for x in c['requirements']},{'req','orphan'})
        self.assertEqual(c['traces'],[dict(kind='satisfy',sourceId='a',targetId='req',elementId='s'),dict(kind='verify',sourceId='v',targetId='req',elementId='v')])
        self.assertNotIn('passed',json.dumps(c))
    def test_verification_objective_alias_is_not_a_second_obligation(self):
        r=model();req=element('req','RequirementUsage','capacity')
        obj=element('obj','RequirementUsage','obj');alias=element('alias','RequirementUsage','alias','obj')
        check=element('check','VerificationCaseDefinition','check',objectiveRequirement=ref(obj),verifiedRequirement=[ref(req)])
        r['elements'] += [req,obj,alias,check]
        self.assertEqual([e['elementId'] for e in catalogue(r)['requirements']],['req'])
    def test_recursive_feature_is_bounded_and_disclosed(self):
        r=model();a=r['elements'][1];a['semantics']['feature'].append(ref(a));c=catalogue(r)
        self.assertTrue(any('Recursive' in w['reason'] for w in c['warnings']))
        self.assertLess(len(c['nodes']),10)
    def test_graph_source_map_keeps_occurrence_and_source_separate(self):
        q=recipe();q['neighbors']=1
        with patch('view_scope.render_svg',return_value='<svg/>'):
            v=compose(catalogue(model()),q)
        self.assertEqual({m['elementId'] for m in v['graphSources'].values()},{'a','b'})
        self.assertEqual({m['occurrence'] for m in v['graphSources'].values()},{'P::Root/a','P::Root/b'})

if __name__=='__main__':unittest.main()
