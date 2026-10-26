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
        check=element('v','VerificationCaseDefinition','capacityCheck',verifiedRequirement=[ref(req)])
        report={'staticChecksPassed':True,'elements':[subject,req,check]}
        p=project(report,'P::capacity',{'view':'TREE'})
        self.assertEqual(p['statement'],'At least two units.')
        self.assertEqual({(e['source'],e['target']) for e in p['edges']},{('v','r'),('r','s')})
        self.assertEqual(p['viewKind'],'requirement')
        self.assertEqual(p['acceptance'],'Not assessed')
        req['source']=req['source'].replace('two','three')
        self.assertEqual(project(report,'P::capacity')['statement'],'At least three units.')
    def test_legend_is_metadata_not_part_of_exported_graph(self):
        p=project(fixture(),'P::Root')
        self.assertIn('Lines: connections',p['legendItems'])
        self.assertNotIn('Lines: connections',render_svg(p))
        self.assertNotIn('labelloc=b',graph_dot(p))

if __name__=='__main__':unittest.main()
