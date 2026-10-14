import copy
import json
import unittest
from engineering import interconnection, exchange_summary
from unittest.mock import patch
from check_contract import check_contract

# Independent small evidence fixture: shared PortUsage instantiated in two occurrences.
def element(id,kind,name,owner=None,**semantics):
    return dict(sessionElementId=id,metaclass=kind,name=name,qualifiedName='P::'+name,
                semantics=dict(owner={'id':owner,'qualifiedName':'P::'+owner} if owner else {},**semantics))
def ref(e):return {'id':e['sessionElementId'],'qualifiedName':e['qualifiedName'],'name':e['name'],'metaclass':e['metaclass']}
def fixture():
    port=element('port','PortUsage','signal',type=[{'name':'Signal','qualifiedName':'P::Signal'}])
    a=element('a','PartUsage','a','Root',feature=[ref(port)],isComposite=True)
    b=element('b','PartUsage','b','Root',feature=[ref(port)],isComposite=True)
    ca=element('ca','Feature','ca',chainingFeature=[ref(a),ref(port)])
    cb=element('cb','Feature','cb',chainingFeature=[ref(b),ref(port)])
    link=element('c','ConnectionUsage','link','Root',relatedFeature=[ref(ca),ref(cb)])
    root=element('Root','PartDefinition','Root',feature=[ref(a),ref(b),ref(link)])
    return {'staticChecksPassed':True,'elements':[root,a,b,port,ca,cb,link]}

class EngineeringTests(unittest.TestCase):
    def test_repeated_type_ports_have_distinct_context_and_correct_endpoints(self):
        p=interconnection(fixture(),'P::Root')
        ports=[m for m in p['marks'] if m['elementId']=='port']
        self.assertEqual(len({m['presentationId'] for m in ports}),2)
        self.assertEqual(p['connectors'][0]['endpoints'],[['a','port'],['b','port']])
        self.assertEqual(p['excluded'],[])
    def test_parallel_links_not_collapsed(self):
        r=fixture();second=copy.deepcopy(r['elements'][-1]);second['sessionElementId']='c2';second['name']='second';r['elements'].append(second)
        r['elements'][0]['semantics']['feature'].append(ref(second))
        p=interconnection(r,'P::Root');self.assertEqual(len(p['connectors']),2)
        self.assertNotEqual(p['connectors'][0]['points'],p['connectors'][1]['points'])
    def test_unsupported_endpoint_visible(self):
        r=fixture();r['elements'][-1]['semantics']['relatedFeature'][0]={'id':'unavailable'}
        p=interconnection(r,'P::Root');self.assertEqual(len(p['excluded']),1);self.assertEqual(p['connectors'],[])
    def test_no_arrow_inferred_and_no_source_mutation(self):
        r=fixture();before=json.dumps(r,sort_keys=True);svg=interconnection(r,'P::Root')['svg']
        self.assertNotIn('marker-end',svg);self.assertEqual(json.dumps(r,sort_keys=True),before)
    def test_invalid_report_fails_closed(self):
        r=fixture();r['staticChecksPassed']=False
        with self.assertRaises(ValueError):interconnection(r,'P::Root')
    def test_order_independent(self):
        r=fixture();p=interconnection(r,'P::Root');r['elements'].reverse()
        self.assertEqual(p,interconnection(r,'P::Root'))
    def test_contract_rejects_wrong_owned_fact(self):
        contract={'schemaVersion':1,'checks':[{'id':'a','select':{'qualifiedName':'P::a'},'expect':{'owner':'P::Root','semanticFields':{'isComposite':True}}}]}
        r=fixture();self.assertTrue(check_contract(r,contract)['passed']);r['elements'][1]['semantics']['isComposite']=False
        self.assertFalse(check_contract(r,contract)['passed'])
    def test_explicit_flow_roles_determine_arrow_not_connection_order(self):
        r=fixture(); ix={e['sessionElementId']:e for e in r['elements']};link=ix['c'];link['metaclass']='InterfaceUsage'
        sender=element('sender','PortUsage','sender');receiver=element('receiver','PortUsage','receiver')
        suba=element('suba','ReferenceSubsetting','suba',referencedFeature=ref(ix['ca']))
        subb=element('subb','ReferenceSubsetting','subb',referencedFeature=ref(ix['cb']))
        ua=element('ua','PortUsage','sender',ownedReferenceSubsetting=ref(suba))
        ub=element('ub','PortUsage','receiver',ownedReferenceSubsetting=ref(subb))
        payload=element('payload','PayloadFeature','payload',type=[{'name':'Reading','qualifiedName':'P::Reading'}])
        flow=element('flow','FlowUsage','transfer',sourceFeature=ref(sender),targetFeature=[ref(receiver)],ownedElement=[ref(payload)])
        link['semantics'].update(feature=[ref(flow)],connectorEnd=[ref(ub),ref(ua)])
        r['elements'] += [sender,receiver,suba,subb,ua,ub,payload,flow]
        p=interconnection(r,'P::Root');self.assertEqual(p['flows'][0]['source'],['a','port']);self.assertEqual(p['flows'][0]['target'],['b','port'])
        flow['semantics'].update(sourceFeature=ref(receiver),targetFeature=[ref(sender)])
        p=interconnection(r,'P::Root');self.assertEqual(p['flows'][0]['source'],['b','port']);self.assertEqual(p['flows'][0]['target'],['a','port'])
        self.assertIn('«flow»',p['svg']);self.assertEqual(p['excluded'],[])
    def test_named_presentation_identity_survives_new_engine_session(self):
        r=fixture();before=interconnection(r,'P::Root')
        ids={e['sessionElementId'] for e in r['elements']}
        def remap(v):
            if isinstance(v,list):return [remap(x) for x in v]
            if isinstance(v,dict):return {k:('new-'+x if k in ('id','sessionElementId') and x in ids else remap(x)) for k,x in v.items()}
            return v
        after=interconnection(remap(r),'P::Root')
        self.assertEqual([m['presentationId'] for m in before['marks']],[m['presentationId'] for m in after['marks']])
    def test_scalar_semantic_fields_do_not_crash_contract(self):
        r=fixture();r['elements'].append(element('scalar','LiteralString','scalar',type='text',targetFeature='not-a-reference',sourceFeature='not-a-reference',relatedFeature='not-a-reference'))
        c={'schemaVersion':1,'checks':[{'id':'a','select':{'qualifiedName':'P::a'}}]}
        self.assertTrue(check_contract(r,c)['passed'])
    def test_summary_retains_support_and_reports_omitted_binding(self):
        r=fixture();before=json.dumps(r,sort_keys=True)
        detailed={'flows':[{'source':['a','port'],'target':['b','port'],'item':'Reading','elementId':'f1','connectionId':'c1'},
                           {'source':['a','port'],'target':['b','port'],'item':'Reading','elementId':'f2','connectionId':'c2'}],
                  'connectors':[{'elementId':'c1'},{'elementId':'c2'},{'elementId':'binding'}], 'excluded':[]}
        with patch('engineering.interconnection',return_value=detailed):
            summary=exchange_summary(r,'P::Root')
        self.assertEqual(len(summary['groups']),1)
        self.assertEqual(summary['groups'][0]['sources'],['f1','f2'])
        self.assertEqual(summary['groups'][0]['connections'],['c1','c2'])
        self.assertEqual(summary['excluded'][0]['id'],'binding')
        self.assertIn('No direct connection is asserted',summary['svg'])
        self.assertEqual(json.dumps(r,sort_keys=True),before)

    def test_reference_border_and_xml_escaping(self):
        r=fixture();r['elements'][1]['semantics']['isComposite']=False;r['elements'][1]['name']='<unsafe>'
        svg=interconnection(r,'P::Root')['svg'];self.assertIn('stroke-dasharray',svg);self.assertIn('&lt;unsafe&gt;',svg)

if __name__=='__main__':unittest.main()
