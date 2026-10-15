import copy
import json
import unittest
from unittest.mock import patch
from test_engineering import fixture, element, ref
from view_scope import catalogue, catalogue_for_views, select, compose


def model():
    r=fixture();r['sourceSha256']='a'*64
    # Fixture owners explicitly carry their metaclass like the actual extractor.
    for e in r['elements']:
        if e.get('semantics',{}).get('owner',{}).get('id')=='Root':e['semantics']['owner']['metaclass']='PartDefinition'
    return r


def recipe(**kw):
    return dict(schemaVersion=1,root='P::Root',focus='P::Root/a',depth=0,neighbors=0,kinds=['connection','binding','flow'],hidden=[],pinned=[],**kw)


class ViewScopeTests(unittest.TestCase):
    def test_quoted_slash_name_collision_blocks_catalogue_without_partial_fallback(self):
        # Independently distinct semantic declarations: a direct 'rack/unit'
        # feature and unit nested under rack produce the same legacy path.
        direct = element('direct', 'PartUsage', 'rack/unit', isComposite=True, feature=[])
        unit = element('unit', 'PartUsage', 'unit', isComposite=True, feature=[])
        rack = element('rack', 'PartUsage', 'rack', isComposite=True, feature=[ref(unit)])
        root = element('vehicle', 'PartDefinition', 'Vehicle', feature=[ref(direct), ref(rack)])
        direct['semantics']['owner'] = ref(root)
        rack['semantics']['owner'] = ref(root)
        unit['semantics']['owner'] = ref(rack)
        report = {'staticChecksPassed': True, 'sourceSha256': 'f' * 64,
                  'elements': [root, direct, rack, unit]}
        original = json.dumps(report, sort_keys=True)
        with self.assertRaisesRegex(ValueError, 'Ambiguous model occurrence path.*rack/unit'):
            catalogue(report)
        with self.assertRaisesRegex(ValueError, 'source and configured diagrams remain available'):
            catalogue_for_views(report, [{'names': [root['qualifiedName']]}])
        self.assertEqual(json.dumps(report, sort_keys=True), original)

    def test_legacy_ambiguous_catalogue_is_rejected_before_selection_or_composition(self):
        catalog = catalogue(model())
        duplicate = copy.deepcopy(next(n for n in catalog['nodes'] if n['key'] == 'P::Root/a'))
        duplicate['elementId'] = 'different-semantic-component'
        catalog['nodes'].append(duplicate)
        for operation in (select, compose):
            with self.subTest(operation=operation.__name__):
                with self.assertRaisesRegex(ValueError, 'Ambiguous model occurrence path'):
                    operation(catalog, recipe())

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
    def test_satisfaction_chain_distinguishes_repeated_occurrences(self):
        r=model(); motor=element('motor','PartUsage','motor',feature=[])
        r['elements'].append(motor)
        for e in r['elements'][1:3]: e['semantics']['feature'].append(ref(motor))
        req=element('req','RequirementUsage','capacity')
        chain=element('chain','Feature','chain',chainingFeature=[ref(r['elements'][1]),ref(motor)])
        expr=element('expr','FeatureReferenceExpression','expr',referent=ref(chain))
        subject=element('subject','ReferenceUsage','subject',ownedElement=[ref(expr)])
        assertion=element('s','SatisfyRequirementUsage','assertion',subjectParameter=ref(subject),satisfyingFeature=ref(motor),satisfiedRequirement=ref(req),isNegated=False)
        r['elements'] += [req,chain,expr,subject,assertion]
        c=catalogue(r)
        self.assertEqual(c['traces'][0]['sourceOccurrences'],['P::Root/a/motor'])
        self.assertNotIn('P::Root/b/motor',c['traces'][0]['sourceOccurrences'])
        chain['semantics']['chainingFeature']=[ref(motor)]
        c=catalogue(r)
        self.assertEqual(c['traces'][0]['sourceOccurrences'],[])
        self.assertTrue(any('occurrence unresolved' in w['reason'] for w in c['warnings']))

    def test_explicit_satisfaction_chain_selects_one_repeated_occurrence(self):
        r=model(); motor=element('motor','PartUsage','motor',feature=[])
        r['elements'].append(motor)
        for e in r['elements'][1:3]: e['semantics']['feature'].append(ref(motor))
        req=element('req','RequirementUsage','capacity')
        assertion=element('s','SatisfyRequirementUsage','assertion',
                          satisfyingFeature=ref(motor), satisfiedRequirement=ref(req),
                          satisfyingFeatureChain=[ref(r['elements'][1]), ref(motor)], isNegated=False)
        r['elements'] += [req, assertion]
        c=catalogue(r)
        self.assertEqual(c['traces'][0]['sourceOccurrences'],['P::Root/a/motor'])
        self.assertNotIn('P::Root/b/motor',c['traces'][0]['sourceOccurrences'])

    def test_explicit_relative_chain_is_ambiguous_without_fallback(self):
        r=model(); motor=element('motor','PartUsage','motor',feature=[])
        r['elements'].append(motor)
        for e in r['elements'][1:3]: e['semantics']['feature'].append(ref(motor))
        req=element('req','RequirementUsage','capacity')
        assertion=element('s','SatisfyRequirementUsage','assertion',
                          satisfyingFeature=ref(motor), satisfiedRequirement=ref(req),
                          satisfyingFeatureChain=[ref(motor)], isNegated=False)
        r['elements'] += [req, assertion]
        c=catalogue(r)
        self.assertEqual(c['traces'][0]['sourceOccurrences'],[])
        self.assertTrue(any('occurrence unresolved' in w['reason'] for w in c['warnings']))

    def test_malformed_explicit_chain_does_not_fall_back_to_native_path(self):
        r=model(); motor=element('motor','PartUsage','motor',feature=[])
        r['elements'].append(motor)
        for e in r['elements'][1:3]: e['semantics']['feature'].append(ref(motor))
        req=element('req','RequirementUsage','capacity')
        chain=element('chain','Feature','chain',chainingFeature=[ref(r['elements'][1]),ref(motor)])
        expr=element('expr','FeatureReferenceExpression','expr',referent=ref(chain))
        subject=element('subject','ReferenceUsage','subject',ownedElement=[ref(expr)])
        assertion=element('s','SatisfyRequirementUsage','assertion',subjectParameter=ref(subject),
                          satisfyingFeature=ref(motor), satisfiedRequirement=ref(req),
                          satisfyingFeatureChain=ref(motor), isNegated=False)
        r['elements'] += [req,chain,expr,subject,assertion]
        for malformed in (ref(motor), [], [{'id':'missing'}], [ref(motor), 'relative']):
            with self.subTest(malformed=malformed):
                assertion['semantics']['satisfyingFeatureChain'] = malformed
                c=catalogue(r)
                self.assertEqual(c['traces'][0]['sourceOccurrences'],[])
                self.assertTrue(any('occurrence unresolved' in w['reason'] for w in c['warnings']))

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
        satisfy=element('s','SatisfyRequirementUsage','assertion',satisfyingFeature=ref(r['elements'][1]),satisfiedRequirement=ref(req),isNegated=False)
        verify=element('v','VerificationCaseDefinition','planned',verifiedRequirement=[ref(req)])
        r['elements'] += [req,orphan,satisfy,verify];c=catalogue(r)
        self.assertEqual({x['elementId'] for x in c['requirements']},{'req','orphan'})
        self.assertEqual(c['traces'],[dict(kind='satisfy',sourceId='a',sourceOccurrences=['P::Root/a'],targetId='req',elementId='s',polarity='positive',isNegated=False),dict(kind='verify',sourceId='v',targetId='req',elementId='v')])
        self.assertNotIn('passed',json.dumps(c))
    def test_satisfaction_polarity_remains_signed_and_unknown_warns(self):
        for value, expected in ((False, 'positive'), (True, 'negative'), ('false', 'unknown'), (None, 'unknown')):
            with self.subTest(value=value):
                r=model(); req=element('req','RequirementUsage','required')
                assertion=element('s','SatisfyRequirementUsage','assertion',satisfyingFeature=ref(r['elements'][1]),satisfiedRequirement=ref(req))
                if value is not None: assertion['semantics']['isNegated']=value
                r['elements'] += [req,assertion]; c=catalogue(r)
                self.assertEqual(c['traces'][0]['polarity'],expected)
                self.assertEqual(c['traces'][0]['isNegated'],value if expected != 'unknown' else None)
                self.assertEqual(bool(c['warnings']),expected == 'unknown')

    def test_verification_objective_alias_is_not_a_second_obligation(self):
        r=model();req=element('req','RequirementUsage','capacity')
        obj=element('obj','RequirementUsage','obj');alias=element('alias','RequirementUsage','alias','obj')
        check=element('check','VerificationCaseDefinition','check',objectiveRequirement=ref(obj),verifiedRequirement=[ref(req)])
        r['elements'] += [req,obj,alias,check]
        self.assertEqual([e['elementId'] for e in catalogue(r)['requirements']],['req'])

    def test_list_valued_objective_and_owned_internals_stay_out_of_obligations(self):
        r=model(); req=element('req','RequirementUsage','capacity')
        objective=element('objective','RequirementUsage','objective')
        internal=element('internal','RequirementUsage','internal','objective')
        check=element('check','VerificationCaseDefinition','check',objectiveRequirement=[ref(objective)],verifiedRequirement=[ref(req)])
        r['elements'] += [req,objective,internal,check]
        self.assertEqual([e['elementId'] for e in catalogue(r)['requirements']],['req'])

    def test_typed_objective_membership_filters_current_pilot_shape(self):
        r=model(); req=element('req','RequirementUsage','capacity')
        objective=element('objective','RequirementUsage','objective')
        objective['semantics']['owningMembership']={'id':'objective-membership','metaclass':'ObjectiveMembership'}
        internal=element('internal','RequirementUsage','internal','objective')
        internal['semantics']['owningMembership']={'id':'verification-membership','metaclass':'RequirementVerificationMembership'}
        check=element('check','VerificationCaseDefinition','check')
        r['elements'] += [req,objective,internal,check]
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
