import copy
import json
import unittest
from stakeholder import project, render_svg, graph_dot
from test_engineering import fixture, element, ref

class StakeholderTests(unittest.TestCase):
    def test_same_evidence_no_direction_or_mutation(self):
        r=fixture();before=json.dumps(r,sort_keys=True)
        p=project(r,'P::Root')
        self.assertEqual(p['rows'][0]['elementIds'],['c','port'])
        self.assertNotIn('→',render_svg(p))
        self.assertEqual(json.dumps(r,sort_keys=True),before)
        self.assertEqual(p['acceptance'],'Not assessed')
        r['elements'].reverse()
        self.assertEqual(p,project(r,'P::Root'))
    def test_changed_name_and_deleted_link_propagate(self):
        r=fixture();r['elements'][1]['name']='changedComponent'
        r['elements'][0]['semantics']['feature']=[ref(r['elements'][1]),ref(r['elements'][2])]
        p=project(r,'P::Root')
        self.assertEqual(p['components'][0]['title'],'Changed Component')
        self.assertEqual(len(p['components']),2)
    def test_unsupported_relation_and_reference_visible(self):
        r=fixture();r['elements'][-1]['semantics']['relatedFeature'][0]={'id':'missing'}
        r['elements'][1]['semantics']['isComposite']=False
        p=project(r,'P::Root')
        self.assertIn('Referenced component',p['components'][0]['body'])
        self.assertTrue(any('outside extracted' in x for x in p['omissions']))
    def test_invalid_and_ambiguous_scope_fail_closed(self):
        r=fixture();r['staticChecksPassed']=False
        with self.assertRaises(ValueError): project(r,'P::Root')
        r['staticChecksPassed']=True;r['elements'].append(copy.deepcopy(r['elements'][0]))
        with self.assertRaises(ValueError): project(r,'P::Root')
    def test_state_story_preserves_guard_caveat_and_evidence(self):
        a=element('a','StateUsage','stopped');b=element('b','StateUsage','running')
        root=element('root','StateDefinition','States')
        payload=element('p','ReferenceUsage','payload',type=[{'name':'StartRequest'}])
        trigger=element('trigger','AcceptActionUsage','event',payloadParameter=ref(payload))
        transition=element('t','TransitionUsage','start','root',source=ref(a),target=ref(b),triggerAction=[ref(trigger)],guardExpression=[{'id':'g'}])
        p=project({'staticChecksPassed':True,'elements':[root,a,b,payload,trigger,transition]},'P::States')
        self.assertEqual(p['edges'][0]['source'],'a');self.assertEqual(p['edges'][0]['target'],'b')
        self.assertTrue(p['edges'][0]['caution']);self.assertIn('conditions apply',p['edges'][0]['label'])
        self.assertIn('dir="forward"',graph_dot(p))
        self.assertEqual(p['rows'][0]['title'],'Stopped → Running')
        self.assertIn('Start Request',p['rows'][0]['body'])
        self.assertIn('Additional conditions',p['rows'][0]['body'])
        self.assertEqual(p['rows'][0]['elementIds'],['t','a','b','p'])
    def test_verification_is_planning_not_pass(self):
        requirement=element('r','RequirementUsage','capacity')
        check=element('v','VerificationCaseDefinition','Check',verifiedRequirement=[ref(requirement)])
        p=project({'staticChecksPassed':True,'elements':[check,requirement]},'P::Check')
        self.assertIn('not a passed test',p['rows'][1]['body'])
        self.assertEqual(p['rows'][1]['elementIds'],['r','v'])

    def test_verification_takeaway_does_not_claim_a_missing_link(self):
        check=element('v','VerificationCaseDefinition','Check')
        report={'staticChecksPassed':True,'elements':[check]}
        p=project(report,'P::Check')
        self.assertIn('requirement link is unavailable',p['takeaway'])
        requirement=element('r','RequirementUsage','capacity')
        check['semantics']['verifiedRequirement']=[ref(requirement)]
        p=project({'staticChecksPassed':True,'elements':[check,requirement]},'P::Check')
        self.assertIn('linked to its obligation',p['takeaway'])
        self.assertNotIn('unavailable',p['takeaway'])

    def test_action_story_does_not_require_legacy_behavior_version(self):
        root=element('root','ActionDefinition','Run')
        first=element('first','ActionUsage','receive','root')
        last=element('last','ActionUsage','notify','root')
        link=element('link','SuccessionAsUsage','sequence','root',sourceFeature=ref(first),targetFeature=[ref(last)])
        report={'staticChecksPassed':True,'elements':[root,first,last,link]}
        p=project(report,'P::Run')
        self.assertEqual(p['viewKind'],'actions')
        self.assertEqual(len(p['behavior']['relations']),1)
        self.assertEqual(p['behavior']['relations'][0]['source'],'first')
        self.assertEqual(p['behavior']['relations'][0]['target'],'last')

    def test_empty_entry_row_names_membership_boundary_without_action_claim(self):
        root=element('root','StateDefinition','States')
        membership=element('entryMembership','StateSubactionMembership','entry','root')
        membership['semantics']['kind']='entry'
        root['semantics']['entryDeclaration']={'id':'entryMembership','metaclass':'StateSubactionMembership'}
        stopped=element('stopped','StateUsage','stopped','root')
        initial=element('initial','SuccessionAsUsage','initial','root',source=ref(membership),target=ref(stopped))
        p=project({'staticChecksPassed':True,'behaviorFieldsVersion':1,'elements':[root,membership,stopped,initial]},'P::States')
        row=next(row for row in p['rows'] if row['title'].startswith('R1:'))
        self.assertIn('StateSubactionMembership witness',row['body'])
        self.assertNotIn('ActionUsage',row['body'])

    def test_legacy_stakeholder_state_story_keeps_typed_entry_boundary(self):
        root=element('root','StateDefinition','States')
        membership=element('entryMembership','StateSubactionMembership','entry','root')
        membership['semantics']['kind']='entry'
        root['semantics']['entryDeclaration']=ref(membership)
        stopped=element('stopped','StateUsage','stopped','root')
        initial=element('initial','SuccessionAsUsage','initial','root',source=ref(membership),target=ref(stopped))
        p=project({'staticChecksPassed':True,'elements':[root,membership,stopped,initial]},'P::States')
        self.assertEqual(p['viewKind'],'states')
        self.assertEqual([(e['source'],e['target'],e['kind']) for e in p['edges']], [('entryMembership','stopped','transition')])
        self.assertIn('Entry declaration',p['edges'][0]['label'])
        row=next(row for row in p['rows'] if row['title']=='Entry → Stopped')
        self.assertIn('StateSubactionMembership witness',row['body'])
        self.assertIn('Condition evidence is unavailable',row['body'])
        self.assertNotIn('ActionUsage',row['body'])
        self.assertEqual(next(node for node in p['nodes'] if node['id']=='entryMembership')['role'],'boundary')
        self.assertIn('Entry declaration',graph_dot(p))

    def test_null_entry_membership_name_uses_human_boundary_label(self):
        root=element('root','StateDefinition','States')
        membership=element('entryMembership','StateSubactionMembership','entry','root')
        membership['name']=None
        membership['source']='entry;'
        membership['semantics']['kind']='entry'
        root['semantics']['entryDeclaration']=ref(membership)
        stopped=element('stopped','StateUsage','stopped','root')
        initial=element('initial','SuccessionAsUsage','initial','root',source=ref(membership),target=ref(stopped))
        p=project({'staticChecksPassed':True,'elements':[root,membership,stopped,initial]},'P::States')
        boundary=next(node for node in p['nodes'] if node['id']=='entryMembership')
        self.assertEqual(boundary['label'],'Entry')
        self.assertEqual(boundary['id'],'entryMembership')
        row=next(row for row in p['rows'] if row['title']=='Entry → Stopped')
        self.assertIn('entryMembership',row['elementIds'])
        self.assertNotIn('None',graph_dot(p))

    def test_graph_keeps_topology_and_undirected_connections(self):
        p=project(fixture(),'P::Root')
        self.assertEqual({n['id'] for n in p['nodes']},{'a','b'})
        self.assertEqual([(e['source'],e['target'],e['elementId'],e['kind']) for e in p['edges']],[('a','b','c','connection')])
        self.assertIn('dir="none"',graph_dot(p))
        self.assertNotIn('dir="forward"',graph_dot(p))
        self.assertIn('psysml:c',render_svg(p))
    def test_parallel_connections_are_not_silently_merged(self):
        r=fixture();c=copy.deepcopy(r['elements'][-1]);c['sessionElementId']='c2';r['elements'].append(c);r['elements'][0]['semantics']['feature'].append(ref(c))
        p=project(r,'P::Root');self.assertEqual(len(p['edges']),2)
        self.assertEqual({e['elementId'] for e in p['edges']},{'c','c2'})
    def test_long_unicode_labels_and_dot_escaping(self):
        r=fixture();r['elements'][1]['name']='冷却系统 '+('LongName '*8)+'"; evil -> fake; //'
        p=project(r,'P::Root')
        import xml.etree.ElementTree as ET
        svg=ET.fromstring(render_svg(p))
        groups=[g for g in svg.iter() if g.attrib.get('class')=='node']
        self.assertEqual(len(groups),2)
        self.assertIn('冷却系统',render_svg(p))
    def test_untrusted_labels_escape_svg(self):
        r=fixture();r['elements'][1]['name']='<script>alert(1)</script>'
        s=render_svg(project(r,'P::Root'))
        self.assertNotIn('<script>',s);self.assertIn('&lt;script&gt;',s)

class StakeholderViewpointTests(unittest.TestCase):
    def test_decomposition_is_hierarchy_not_an_interconnection_copy(self):
        r=fixture();p=project(r,'P::Root',{'view':'TREE'})
        self.assertEqual(p['viewKind'],'decomposition')
        self.assertTrue(all(e['kind']=='containment' for e in p['edges']))
        self.assertEqual(len(p['edges']),2)
        self.assertIn('rankdir=TB',graph_dot(p))
        self.assertFalse(any(e['elementId']=='c' for e in p['edges']))
    def test_reused_child_is_shown_as_two_occurrences_with_shared_source(self):
        r=fixture();child=element('motor','PartUsage','motor',isComposite=True)
        r['elements'].append(child)
        for e in r['elements'][1:3]: e['semantics']['feature']=[ref(child)]
        p=project(r,'P::Root',{'view':'TREE'})
        occurrences=[n for n in p['nodes'] if n.get('elementId')=='motor']
        self.assertEqual(len(occurrences),2)
        self.assertNotEqual(occurrences[0]['id'],occurrences[1]['id'])
        self.assertEqual(graph_dot(p).count('psysml:motor'),4) # node and containment source links
    def test_summary_does_not_relabel_connections_as_transfers(self):
        p=project(fixture(),'P::Root',{'view':'INTERCONNECTION','renderer':'summary'})
        self.assertEqual(p['viewKind'],'exchanges')
        self.assertEqual(p['edges'],[])
        self.assertIn('0 declared transfers',p['takeaway'])
    def test_requirement_quotes_source_and_resolves_subject_and_planned_check(self):
        subject=element('s','ReferenceUsage','station')
        req=element('r','RequirementUsage','capacity',subjectParameter=ref(subject))
        req['source']='requirement capacity { doc /* At least two units. */ }'
        doc=element('doc','Documentation','statement',body=' At least two units. ',documentedElement=ref(req));doc['semantics']['owner']=ref(req)
        req['semantics']['documentation']=[ref(doc)]
        check=element('v','VerificationCaseDefinition','capacityCheck',verifiedRequirement=[ref(req)])
        report={'staticChecksPassed':True,'elements':[subject,req,check,doc]}
        p=project(report,'P::capacity',{'view':'TREE'})
        self.assertEqual(p['statement'],'At least two units.')
        self.assertEqual({(e['source'],e['target']) for e in p['edges']},{('v','r'),('r','s')})
        self.assertEqual(p['viewKind'],'requirement')
        self.assertEqual(p['acceptance'],'Not assessed')
        req['source']=req['source'].replace('two','three')
        doc['semantics']['body']='At least three units.'
        self.assertEqual(project(report,'P::capacity')['statement'],'At least three units.')

    def test_requirement_shows_supported_declared_capacity_comparison(self):
        req=element('req','RequirementUsage','capacity')
        literal=element('literal','LiteralInteger','declared',value=2)
        attribute=element('attribute','AttributeUsage','sampleCapacity',
                          type=[{'id':'integer','name':'Integer','qualifiedName':'ScalarValues::Integer'}],
                          ownedElement=[ref(literal)])
        left=element('left','FeatureReferenceExpression','left',referent=ref(attribute))
        right=element('right','LiteralInteger','minimum',value=3)
        expression=element('expression','OperatorExpression','predicate',operator='>=',operand=[ref(left),ref(right)])
        constraint=element('constraint','ConstraintUsage','capacityConstraint','req',ownedElement=[ref(expression)])
        membership=element('membership','RequirementConstraintMembership','membership','req',ownedConstraint=ref(constraint))
        membership['semantics']['kind']='requirement'
        constraint['semantics']['owner']={'id':'req','qualifiedName':'P::capacity','metaclass':'RequirementUsage'}
        constraint['semantics']['owningMembership']=ref(membership)
        report={'staticChecksPassed':True,'sourceSha256':'a'*64,
                'elements':[req,literal,attribute,left,right,expression,constraint,membership]}
        p=project(report,'P::capacity')
        comparison=next(row for row in p['rows'] if row.get('kind')=='declared-capacity-comparison')
        self.assertEqual(comparison['title'],'Required minimum 3 vs declared sample capacity 2')
        self.assertIn('Declared design shortfall',comparison['body'])
        self.assertIn('Physical verification: not evaluated.',comparison['body'])
        self.assertEqual(comparison['status'],'declared-design-shortfall')
        self.assertEqual(comparison['physicalVerification'],'not-evaluated')
        self.assertEqual(comparison['elementIds'],['req','attribute','constraint'])
        self.assertEqual(comparison['evidence'],{'attributeElementId':'attribute','constraintElementIds':['constraint']})

    def test_requirement_omits_unsupported_declared_capacity_comparison(self):
        req=element('req','RequirementUsage','capacity')
        literal=element('literal','LiteralInteger','declared',value=2)
        attribute=element('attribute','AttributeUsage','sampleCapacity',
                          type=[{'id':'text','name':'String','qualifiedName':'ScalarValues::String'}],
                          ownedElement=[ref(literal)])
        left=element('left','FeatureReferenceExpression','left',referent=ref(attribute))
        right=element('right','LiteralInteger','minimum',value=3)
        expression=element('expression','OperatorExpression','predicate',operator='>=',operand=[ref(left),ref(right)])
        constraint=element('constraint','ConstraintUsage','capacityConstraint','req',ownedElement=[ref(expression)])
        membership=element('membership','RequirementConstraintMembership','membership','req',ownedConstraint=ref(constraint))
        membership['semantics']['kind']='requirement'
        constraint['semantics']['owner']={'id':'req','qualifiedName':'P::capacity','metaclass':'RequirementUsage'}
        constraint['semantics']['owningMembership']=ref(membership)
        report={'staticChecksPassed':True,'sourceSha256':'a'*64,
                'elements':[req,literal,attribute,left,right,expression,constraint,membership]}
        p=project(report,'P::capacity')
        self.assertFalse(any(row.get('kind')=='declared-capacity-comparison' for row in p['rows']))

    def test_nested_documentation_is_not_parent_statement(self):
        req=element('r','RequirementUsage','parent',documentation=[])
        req['source']='requirement parent { attribute detail { doc /* Child only. */ } }'
        child=element('child','AttributeUsage','detail',documentation=[{'id':'doc'}]);child['semantics']['owner']=ref(req)
        doc=element('doc','Documentation','statement',body='Child only.',documentedElement=ref(child));doc['semantics']['owner']=ref(child)
        report={'staticChecksPassed':True,'elements':[req,child,doc]}
        p=project(report,'P::parent')
        self.assertEqual(p['statement'],''); self.assertEqual(p['documentationStatus'],'absent')
        del req['semantics']['documentation']
        p=project(report,'P::parent')
        self.assertEqual(p['statement'],''); self.assertEqual(p['documentationStatus'],'unknown')
        self.assertTrue(p['warnings'])

    def test_satisfaction_assertions_are_signed_in_graph_and_rows(self):
        req=element('r','RequirementUsage','required',documentation=[])
        subject=element('s','PartUsage','system')
        for value, label in ((False,'Asserts satisfaction'),(True,'Asserts non-satisfaction'),(None,'Satisfaction polarity unknown')):
            with self.subTest(value=value):
                assertion=element('a','SatisfyRequirementUsage','assertion',satisfyingFeature=ref(subject),satisfiedRequirement=ref(req))
                if value is not None: assertion['semantics']['isNegated']=value
                p=project({'staticChecksPassed':True,'elements':[req,subject,assertion]},'P::required')
                self.assertEqual(p['edges'][0]['label'],label)
                self.assertEqual(p['rows'][-1]['title'],label)
                import xml.etree.ElementTree as ET
                self.assertIn(label, ' '.join(''.join(ET.fromstring(render_svg(p)).itertext()).split()))
                self.assertEqual(p['edges'][0]['caution'],value is not False)

    def test_legend_is_metadata_not_part_of_exported_graph(self):
        p=project(fixture(),'P::Root')
        self.assertIn('Lines: connections',p['legendItems'])
        self.assertNotIn('Lines: connections',render_svg(p))
        self.assertNotIn('labelloc=b',graph_dot(p))

if __name__=='__main__':unittest.main()


class SmallDisconnectedComponentLayout(unittest.TestCase):
    def test_five_unconnected_components_keep_identity_without_inventing_links(self):
        import xml.etree.ElementTree as ET
        projection={'viewKind':'connections','nodes':[{'id':str(i),'label':'Engine '+str(i+1)+'\nF-1','role':'component','referenced':False} for i in range(5)],'edges':[]}
        before=copy.deepcopy(projection)
        svg=render_svg(projection);root=ET.fromstring(svg)
        width,height=map(float,root.attrib['viewBox'].split()[2:])
        self.assertGreater(width/height,1.4)
        self.assertLess(width/height,5)
        self.assertEqual(projection,before)
        self.assertEqual(len(root.findall('.//{http://www.w3.org/2000/svg}g[@class="node"]')),5)
        self.assertEqual(root.findall('.//{http://www.w3.org/2000/svg}g[@class="edge"]'),[])
        self.assertIn('psysml:4',svg)
        connected=copy.deepcopy(projection);connected['edges']=[{'source':'0','target':'1','kind':'connection','elementId':'link','label':'Connection','caution':False}]
        self.assertNotIn('style=invis',graph_dot(connected))
