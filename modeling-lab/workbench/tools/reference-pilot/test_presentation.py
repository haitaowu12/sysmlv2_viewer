"""Independent projection cases for names, target notation and collection counts."""
import copy
import unittest
from presentation import resolve_target, part_features, cardinality, multiplicity, scalar_alias_evidence
from engineering import interconnection
from stakeholder import project
from view_scope import catalogue


def element(eid, kind, name, owner=None, **sem):
    return {'sessionElementId': eid, 'metaclass': kind, 'name': name,
            'qualifiedName': ('Study::' + name) if isinstance(name, str) else None,
            'semantics': {'owner': {'id': owner, 'metaclass': 'PartDefinition'} if owner else {}, **sem}}


def ref(e):
    return {'id': e['sessionElementId'], 'metaclass': e['metaclass'], 'name': e['name'], 'qualifiedName': e['qualifiedName']}


def collections_fixture():
    a = element('a', 'PartUsage', 'engine1', 'root', feature=[], isComposite=True)
    b = element('b', 'PartUsage', 'engine2', 'root', feature=[], isComposite=True)
    one = element('two', 'LiteralInteger', None, value=2)
    infinity = element('star', 'LiteralInfinity', None)
    two = element('mult-two', 'MultiplicityRange', None, bound=[ref(one)])
    star = element('mult-star', 'MultiplicityRange', None, bound=[ref(infinity)])
    ar = element('ar', 'FeatureReferenceExpression', None, referent=ref(a))
    br = element('br', 'FeatureReferenceExpression', None, referent=ref(b))
    sequence = element('sequence', 'OperatorExpression', None, operator=',', operand=[ref(ar), ref(br)])
    null = element('null', 'NullExpression', None)
    bound = element('engines', 'PartUsage', 'engines', 'root', feature=[], multiplicity=ref(two), value=ref(sequence))
    empty = element('subcomponents', 'PartUsage', 'subcomponents', 'root', feature=[], multiplicity=ref(star), value=ref(null))
    root = element('root', 'PartDefinition', 'Root', feature=[ref(a), ref(b), ref(bound), ref(empty)])
    return {'staticChecksPassed': True, 'sourceSha256': 'fixture', 'elements': [root,a,b,one,infinity,two,star,ar,br,sequence,null,bound,empty]}


class TargetNotationTests(unittest.TestCase):
    def test_document_namespace_is_only_skipped_with_bidirectional_typed_evidence(self):
        document=element('doc','Namespace',None,ownedMember=[{'id':'package'}])
        document['qualifiedName']=None
        package=element('package','Package','TechnicalComponentsPackage','doc')
        stage=element('stage','PartDefinition','S-IC','package',feature=[])
        stage['qualifiedName']='TechnicalComponentsPackage::S-IC'
        report={'elements':[document,package,stage]}
        self.assertIs(resolve_target(report,"TechnicalComponentsPackage::'S-IC'"),stage)
        document['semantics']['ownedMember']=[]
        with self.assertRaises(ValueError):resolve_target(report,"TechnicalComponentsPackage::'S-IC'")
        document['semantics']['ownedMember']=[{'id':'package'}]
        document['semantics']['owner']={'id':'another'}
        with self.assertRaises(ValueError):resolve_target(report,"TechnicalComponentsPackage::'S-IC'")

    def test_quoted_target_resolves_only_through_exact_typed_owner_path(self):
        package = element('package', 'Package', 'TechnicalComponentsPackage')
        stage = element('stage', 'PartDefinition', 'S-IC', 'package', feature=[])
        stage['qualifiedName'] = 'TechnicalComponentsPackage::S-IC'
        report = {'staticChecksPassed': True, 'elements': [package, stage]}
        before = copy.deepcopy(report)
        self.assertIs(resolve_target(report, "TechnicalComponentsPackage::'S-IC'"), stage)
        self.assertIs(resolve_target(report, stage['qualifiedName']), stage)
        self.assertEqual(project(report, "TechnicalComponentsPackage::'S-IC'")['scopeElementId'], 'stage')
        self.assertEqual(report, before)
        with self.assertRaises(ValueError): resolve_target(report, "'S-IC'")
        stage['semantics']['owner'] = {'id': 'missing'}
        with self.assertRaises(ValueError): resolve_target(report, "TechnicalComponentsPackage::'S-IC'")

    def test_quoted_delimiters_and_escapes_are_atomic_and_ambiguity_rejects(self):
        package = element('p', 'Package', 'P')
        compound = element('compound', 'PartDefinition', 'A::B', 'p')
        compound['qualifiedName'] = "P::'A::B'"
        a = element('a', 'Package', 'A', 'p'); a['qualifiedName'] = 'P::A'
        b = element('b', 'PartDefinition', 'B', 'a'); b['qualifiedName'] = 'P::A::B'
        escaped = element('escaped', 'PartDefinition', "pilot's\\panel", 'p'); escaped['qualifiedName'] = 'P::export-spelling'
        r = {'elements': [package,compound,a,b,escaped]}
        self.assertIs(resolve_target(r, "'P'::'A::B'"), compound)
        self.assertIs(resolve_target(r, "'P'::A::B"), b)
        self.assertIs(resolve_target(r, "P::'pilot\\'s\\\\panel'"), escaped)
        for target in (None, '', "P::'A", 'P::A::', "P::'unknown'", "P::'bad\\q'"):
            with self.subTest(target=target), self.assertRaises(ValueError): resolve_target(r, target)
        duplicate = copy.deepcopy(escaped); duplicate['sessionElementId']='duplicate'; duplicate['qualifiedName']='P::other-export'
        r['elements'].append(duplicate)
        with self.assertRaises(ValueError): resolve_target(r, "P::'pilot\\'s\\\\panel'")


class ProjectionPresentationTests(unittest.TestCase):
    def scalar_alias_fixture(self):
        target=element('target','PartUsage','deployedModule',isComposite=True,feature=[])
        implicit=element('implicit','Multiplicity',None)
        value=element('alias-value','FeatureReferenceExpression',None,referent=ref(target))
        alias=element('alias','PartUsage','displayModule','root',isComposite=False,
                      multiplicity=ref(implicit),value=ref(value),feature=[])
        alias['source']='ref part displayModule : Unit = Study::deployedModule;'
        root=element('root','PartDefinition','Overview',feature=[ref(alias)])
        return root,alias,value,target,implicit

    def test_resolved_scalar_alias_retains_feature_without_promoting_unknown_cardinality(self):
        root,alias,value,target,implicit=self.scalar_alias_fixture()
        for retained in (False,True):
            index={e['sessionElementId']:e for e in (root,alias,value,target)}
            if retained:index[implicit['sessionElementId']]=implicit
            before=copy.deepcopy(index)
            with self.subTest(implicitRetained=retained):
                self.assertEqual(cardinality(alias,index)['status'],'unknown')
                proof=scalar_alias_evidence(alias,value,index)
                self.assertEqual(proof['cardinality'],'unknown')
                self.assertEqual(proof['evidenceIds'],['alias','alias-value','target'])
                self.assertIn('population are not inferred',proof['reason'])
                ordinary,collections=part_features(root,index)
                self.assertEqual([e['sessionElementId'] for e in ordinary],['alias'])
                self.assertEqual(collections,[])
                self.assertEqual(index,before)

    def test_direct_scalar_alias_does_not_bypass_symbolic_or_inherited_range(self):
        for uncertain in ('alias','target'):
            root,alias,value,target,_=self.scalar_alias_fixture()
            symbolic=element('symbol','FeatureReferenceExpression',None,referent={'id':'population'})
            bound=element('range','MultiplicityRange',None,bound=[ref(symbolic)])
            index={e['sessionElementId']:e for e in (root,alias,value,target,symbolic,bound)}
            index[uncertain]['semantics']['multiplicity']=ref(bound)
            if uncertain=='alias':alias['source']='ref part displayModule : Unit [population] = Study::deployedModule;'
            with self.subTest(uncertain=uncertain):
                self.assertIsNone(scalar_alias_evidence(alias,value,index))
                ordinary,collections=part_features(root,index)
                self.assertEqual(ordinary,[])
                self.assertEqual(collections[0]['cardinality'],'unknown')
                self.assertEqual(collections[0]['memberIds'],[])
        root,alias,value,target,_=self.scalar_alias_fixture()
        index={e['sessionElementId']:e for e in (root,alias,value,target)}
        alias['semantics']['ownedSubsetting']=[{'id':'inherited-cardinality'}]
        self.assertIsNone(scalar_alias_evidence(alias,value,index))

    def test_scalar_alias_requires_exact_declaration_and_unique_typed_referent(self):
        root,alias,value,target,_=self.scalar_alias_fixture()
        index={e['sessionElementId']:e for e in (root,alias,value,target)}
        for source in ('ref part displayModule : Unit [population] = Study::deployedModule;',
                       'ref part displayModule : Unit = (Study::deployedModule, Study::other);',
                       'ref part displayModule : Unit = Study::other;',
                       'ref part displayModule :> inherited = Study::deployedModule;',
                       '/* ref part displayModule : Unit = Study::deployedModule; */'):
            alias['source']=source
            with self.subTest(source=source):self.assertIsNone(scalar_alias_evidence(alias,value,index))
        alias['source']='ref part displayModule : Unit = Study::deployedModule;'
        value['semantics']['referent']=[ref(target),{'id':'other'}]
        self.assertIsNone(scalar_alias_evidence(alias,value,index))

    def test_symbolic_cardinality_keeps_binding_unknown_with_specific_witnesses(self):
        report=collections_fixture()
        index={e['sessionElementId']:e for e in report['elements']}
        bound=index['engines']
        bound['name']='selectedModules'
        bound['source']='ref part selectedModules : Unit [population] = (engine1, engine2);'
        bound['semantics']['isComposite']=False
        population=element('population','AttributeUsage','population','root')
        expression=element('population-ref','FeatureReferenceExpression',None,referent=ref(population))
        report['elements'] += [population,expression]
        index.update({e['sessionElementId']:e for e in [population,expression]})
        index['mult-two']['semantics']['bound']=[ref(expression)]
        before=copy.deepcopy(report)
        detail=cardinality(bound,index)
        self.assertEqual(detail['status'],'unknown')
        self.assertEqual(detail['label'],'[?]')
        self.assertEqual(detail['evidenceIds'],['mult-two','population-ref'])
        ordinary,collections=part_features(index['root'],index)
        self.assertNotIn('engines',[e['sessionElementId'] for e in ordinary])
        selected=next(c for c in collections if c['elementId']=='engines')
        self.assertEqual(selected['kind'],'unresolved-collection')
        self.assertEqual(selected['cardinality'],'unknown')
        self.assertEqual(selected['memberIds'],[])
        self.assertTrue({'mult-two','population-ref','sequence'} <= set(selected['evidenceIds']))
        self.assertIn('cardinality is unknown',selected['reason'])
        self.assertIn('count are not inferred',selected['reason'])
        drawing=interconnection(report,'Study::Root')
        self.assertIn('Bound feature · cardinality unknown',drawing['svg'])
        self.assertIn('1 collection feature',drawing['svg'])
        self.assertIn('1 bound feature with unknown cardinality',drawing['svg'])
        self.assertNotIn('Collection feature · selectedModules',drawing['svg'])
        self.assertTrue(any(row['title'].startswith('Bound feature · cardinality unknown') for row in project(report,'Study::Root')['rows']))
        self.assertTrue(any('/ bound feature · cardinality unknown:' in row['title'] for row in project(report,'Study::Root',{'view':'TREE'})['rows']))
        self.assertTrue(any('Bound feature · cardinality unknown' in warning['reason'] for warning in catalogue(report)['warnings']))
        self.assertEqual(set(drawing['partBounds']),{'a','b'})
        self.assertEqual(len(project(report,'Study::Root')['components']),2)
        self.assertNotIn('engines',[n['elementId'] for n in catalogue(report)['nodes']])
        self.assertEqual(report,before)

    def test_cardinality_distinguishes_literal_single_multi_unknown_without_source_inference(self):
        report=collections_fixture();index={e['sessionElementId']:e for e in report['elements']}
        part=index['engines']
        # Brackets inside a binding or comment are not declaration bounds.
        part['source']='ref part selected : Unit [limit] = (engine1, engine2)[2]; /* [99] */'
        self.assertEqual(cardinality(part,index)['status'],'known-multi')
        self.assertEqual(multiplicity(part,index),('[2]',True))
        index['two']['semantics']['value']=1
        self.assertEqual(cardinality(part,index)['status'],'known-single')
        self.assertEqual(multiplicity(part,index),('[1]',False))
        ordinary,collections=part_features(index['root'],index)
        self.assertIn('engines',[e['sessionElementId'] for e in ordinary])
        self.assertNotIn('engines',[e['elementId'] for e in collections])
        for bound in ([],[{'id':'missing'}]):
            with self.subTest(bound=bound):
                index['mult-two']['semantics']['bound']=bound
                self.assertEqual(cardinality(part,index)['status'],'unknown')
                ordinary,collections=part_features(index['root'],index)
                self.assertNotIn('engines',[e['sessionElementId'] for e in ordinary])
                self.assertEqual(next(c for c in collections if c['elementId']=='engines')['kind'],'unresolved-collection')

    def test_null_names_ports_types_and_connectors_retain_existing_identities(self):
        from test_engineering import fixture
        r = fixture(); before_ids = {e['sessionElementId'] for e in r['elements']}
        for e in r['elements'][1:]:
            e['name'] = None
            e['qualifiedName'] = None
        r['elements'][3]['semantics']['type'] = [{'name': None, 'qualifiedName': 'Study::Signal'}]
        p = interconnection(r, 'P::Root')
        self.assertEqual(len(p['partBounds']), 2)
        self.assertEqual(len(p['connectors']), 1)
        self.assertIn('Unnamed PartUsage', p['svg'])
        self.assertNotIn('None', p['svg'])
        self.assertEqual({e['sessionElementId'] for e in r['elements']}, before_ids)
        self.assertEqual(len(project(r, 'P::Root')['components']), 2)
        catalog = catalogue({**r, 'sourceSha256': 'fixture'})
        self.assertEqual(len(catalog['nodes']), 3)
        self.assertEqual(len({n['key'] for n in catalog['nodes']}), 3)

    def test_bound_and_null_collections_have_witnesses_not_extra_component_boxes(self):
        r = collections_fixture(); before = copy.deepcopy(r)
        drawing = interconnection(r, 'Study::Root')
        self.assertEqual(set(drawing['partBounds']), {'a','b'})
        self.assertEqual({c['elementId'] for c in drawing['collections']}, {'engines','subcomponents'})
        self.assertEqual(drawing['collections'][0]['memberIds'], ['a','b'])
        self.assertIn('[2]', drawing['svg']); self.assertIn('[*]', drawing['svg'])
        self.assertTrue({'engines','subcomponents'} <= {m['elementId'] for m in drawing['marks']})
        stakeholder = project(r, 'Study::Root')
        self.assertEqual(len(stakeholder['components']), 2)
        self.assertIn('Collection feature', ' '.join(row['title'] for row in stakeholder['rows']))
        catalog = catalogue(r)
        self.assertEqual({n['elementId'] for n in catalog['nodes']}, {'root','a','b'})
        self.assertEqual(len(catalog['collections']), 2)
        self.assertEqual(r, before)

    def test_unsupported_collection_and_plain_multiplicity_remain_visible(self):
        r = collections_fixture(); ix={e['sessionElementId']:e for e in r['elements']}
        ix['br']['semantics']['referent'] = {'id': 'missing'}
        ordinary, collections = part_features(ix['root'], ix)
        self.assertNotIn('engines', [e['sessionElementId'] for e in ordinary])
        unresolved = next(c for c in collections if c['elementId'] == 'engines')
        self.assertEqual(unresolved['kind'], 'unresolved-collection')
        self.assertIn('not inferred', unresolved['reason'])
        self.assertEqual(unresolved['memberIds'], [])
        del ix['engines']['semantics']['value']
        ordinary, _ = part_features(ix['root'], ix)
        self.assertIn('engines', [e['sessionElementId'] for e in ordinary])

    def test_native_feature_value_membership_uses_typed_source_and_value(self):
        r = collections_fixture(); ix={e['sessionElementId']:e for e in r['elements']}
        del ix['engines']['semantics']['value']
        membership=element('membership','FeatureValue',None,source=[ref(ix['engines'])],value=ref(ix['sequence']))
        ix['sequence']['semantics']['owningMembership']=ref(membership)
        ix['engines']['semantics']['ownedElement']=[ref(ix['sequence'])]
        ix['membership']=membership
        ordinary, collections=part_features(ix['root'],ix)
        self.assertNotIn('engines',[e['sessionElementId'] for e in ordinary])
        self.assertIn('engines',[c['elementId'] for c in collections])
        membership['semantics']['source']=[ref(ix['a'])]
        ordinary, _=part_features(ix['root'],ix)
        self.assertIn('engines',[e['sessionElementId'] for e in ordinary])


class SubsettingCollectionTests(unittest.TestCase):
    def test_explicit_subsetting_keeps_collection_without_claiming_complete_membership(self):
        r=collections_fixture();ix={e['sessionElementId']:e for e in r['elements']}
        del ix['engines']['semantics']['value']
        relation=element('subset','Subsetting',None,specific=ref(ix['a']),subsettedFeature=ref(ix['engines']))
        ix['a']['semantics']['ownedSubsetting']=[ref(relation)];ix['subset']=relation
        ordinary, collections=part_features(ix['root'],ix)
        collection=next(c for c in collections if c['elementId']=='engines')
        self.assertEqual(collection['kind'],'subset-collection')
        self.assertEqual(collection['memberIds'],['a'])
        self.assertIn('do not establish',collection['reason'])
        self.assertNotIn('engines',[e['sessionElementId'] for e in ordinary])
        relation['semantics']['specific']=ref(ix['b'])
        ordinary,_=part_features(ix['root'],ix)
        self.assertIn('engines',[e['sessionElementId'] for e in ordinary])



class MissingRoleAndExpressionTests(unittest.TestCase):
    def test_null_role_cannot_bind_to_an_unnamed_connector_end(self):
        from engineering import interface_flows
        role=element('role','PortUsage',None)
        end=element('end','PortUsage',None,ownedReferenceSubsetting={'id':'binding'})
        binding=element('binding','ReferenceSubsetting',None,referencedFeature={'id':'port'})
        port=element('port','PortUsage','port')
        payload=element('payload','PayloadFeature','payload',type=[{'name':'Reading'}])
        flow=element('flow','FlowUsage','flow',sourceFeature=ref(role),targetFeature=[ref(role)],ownedElement=[ref(payload)])
        connection=element('connection','InterfaceUsage','connection',feature=[ref(flow)],connectorEnd=[ref(end)])
        ix={e['sessionElementId']:e for e in [role,end,binding,port,payload,flow,connection]}
        flows,excluded=interface_flows(connection,ix)
        self.assertEqual(flows,[])
        self.assertIn('no resolved name',excluded[0]['reason'])

    def test_cyclic_collection_expression_retains_explicit_unknown_record(self):
        r=collections_fixture();ix={e['sessionElementId']:e for e in r['elements']}
        ix['sequence']['semantics']['operand']=[ref(ix['ar']),ref(ix['sequence'])]
        ordinary, collections=part_features(ix['root'],ix)
        record=next(c for c in collections if c['elementId']=='engines')
        self.assertEqual(record['kind'],'unresolved-collection')
        self.assertEqual(record['memberIds'],[])
        self.assertIn('count are not inferred',record['reason'])

if __name__ == '__main__': unittest.main()
