"""Small independent topology/negative contracts, not proof of full-language support."""
import copy
import unittest
from behavior import project, graph_dot


def element(eid,name,kind,owner=None,**semantics):
    if owner: semantics['owner']={'id':owner}
    return dict(sessionElementId=eid,name=name,qualifiedName='Demo::'+name,metaclass=kind,
                line=1,endLine=2,source=name,semantics=semantics)


def model(parallel=True):
    return dict(staticChecksPassed=True,behaviorFieldsVersion=1,sourceSha256='a'*64,
        reportIntegrity={'status':'verified-managed','reportSha256':'b'*64},elements=[
            element('root','state','ExhibitStateUsage',isParallel=parallel),
            element('a','operating','StateUsage','root',isParallel=False),
            element('b','health','StateUsage','root',isParallel=False),
            element('off','off','StateUsage','a',isParallel=False),
            element('on','on','StateUsage','a',isParallel=False,entryAction={'id':'entry'}),
            element('entry','selfTest','PerformActionUsage','on'),
            element('guard','brakeDepressed','OperatorExpression','transition'),
            element('transition','start','TransitionUsage','a',source={'id':'off'},target={'id':'on'},guardExpression={'id':'guard'})])


class BehaviorTests(unittest.TestCase):
    def test_parallel_is_engine_fact_and_changes_projection(self):
        p=project(model(),'Demo::state');q=project(model(False),'Demo::state')
        self.assertTrue(p['nodes'][0]['parallel']);self.assertFalse(q['nodes'][0]['parallel'])
        self.assertNotEqual(graph_dot(p),graph_dot(q))
        self.assertEqual(len(p['relations']),1)
        self.assertEqual((p['relations'][0]['source'],p['relations'][0]['target']),('off','on'))
        self.assertFalse(any(x['source']=='b' or x['target']=='b' for x in p['relations']))

    def test_guard_obligation_and_anchors_survive(self):
        p=project(model(),'Demo::state')
        self.assertEqual(p['relations'][0]['guards'][0]['text'],'brakeDepressed')
        n=next(x for x in p['nodes'] if x['id']=='on')
        self.assertEqual(n['subactions']['entryAction'][0]['elementId'],'entry')
        self.assertEqual({e['endLine'] for e in p['evidence']},{2})

    def test_old_report_is_unknown_not_false(self):
        m=model();m.pop('behaviorFieldsVersion');m['elements'][0]['semantics'].pop('isParallel')
        p=project(m,'Demo::state')
        self.assertIsNone(p['nodes'][0]['parallel']);self.assertEqual(p['coverage'],'partial')
        self.assertIn('Parallelism unknown',graph_dot(p))

    def test_external_endpoint_excluded_not_invented(self):
        m=model();m['elements'][-1]['semantics']['target']={'id':'missing'}
        p=project(m,'Demo::state');self.assertFalse(p['relations']);self.assertEqual(p['coverage'],'partial')

    def test_flow_kinds_not_promoted_to_schedule(self):
        for kind in ('FlowUsage','SuccessionFlowUsage'):
            m=dict(staticChecksPassed=True,elements=[element('root','action','ActionDefinition'),
                element('a','a','ActionUsage','root'),element('b','b','ActionUsage','root'),
                element('r','transfer',kind,'root',sourceFeature=[{'id':'a'}],targetFeature=[{'id':'b'}])])
            p=project(m,'Demo::action');self.assertEqual(p['relations'][0]['kind'],kind)
            self.assertNotIn('executionResult',p)

    def test_unsupported_subtype_visible(self):
        m=dict(staticChecksPassed=True,elements=[element('root','action','ActionDefinition'),
            element('x','branch','IfActionUsage','root')])
        self.assertEqual(project(m,'Demo::action')['coverage'],'partial')

    def test_stakeholder_discloses_all_truncated_quotations(self):
        from stakeholder import behavior_story
        m=model();long_text='A and '*100+'criticalTailCondition'
        for e in m['elements']:
            if e['sessionElementId'] in {'entry','guard'}:e['source']=long_text
        on=next(e for e in m['elements'] if e['sessionElementId']=='on')
        on['semantics'].update(doAction={'id':'entry'},exitAction={'id':'entry'})
        m['elements'].append(element('constraint','bounded','ConstraintUsage','on'))
        m['elements'][-1]['source']=long_text
        transition=next(e for e in m['elements'] if e['sessionElementId']=='transition')
        transition['semantics'].update(triggerAction={'id':'guard'},effectAction={'id':'guard'})
        rows=behavior_story(m,'Demo::state')['rows']
        affected=[r for r in rows if r.get('textTruncated')]
        self.assertEqual(len(affected),5)
        for row in affected:
            self.assertIn('[excerpt truncated; inspect source]',row['body'])
            self.assertNotIn('criticalTailCondition',row['body'])
        relation=next(r for r in affected if r['title'].startswith('R1:'))
        self.assertEqual(relation['body'].count('[excerpt truncated; inspect source]'),3)
        m=dict(staticChecksPassed=True,elements=[element('root','action','ActionDefinition'),
            element('a','a','ActionUsage','root'),element('b','b','ActionUsage','root'),
            element('r','transfer','FlowUsage','root',sourceFeature=[{'id':'a'}],targetFeature=[{'id':'b'}])])
        m['elements'][-1]['source']=long_text*2
        row=behavior_story(m,'Demo::action')['rows'][0]
        self.assertTrue(row['textTruncated']);self.assertIn('[excerpt truncated; inspect source]',row['body'])
        m['elements'][-1]['source']='flow transfer'
        row=behavior_story(m,'Demo::action')['rows'][0]
        self.assertFalse(row['textTruncated']);self.assertNotIn('excerpt truncated',row['body'])

    def test_control_nodes_are_explicitly_partial_in_owned_and_inherited_scopes(self):
        controls=('ForkNode','JoinNode','DecisionNode','MergeNode')
        for kind in controls:
            m=dict(staticChecksPassed=True,elements=[element('root','action','ActionDefinition'),
                element('nested','nested','ActionUsage','root'),element('control','branch',kind,'nested')])
            p=project(m,'Demo::action')
            self.assertEqual(p['coverage'],'partial');self.assertFalse(p['relations'])
            self.assertTrue(any(w['elementId']=='control' and kind in w['reason'] for w in p['warnings']))
            self.assertIn('control',{e['elementId'] for e in p['evidence']})
            m['elements'][0]['semantics']['inheritedFeature']=[{'id':'external','metaclass':kind}]
            m['elements']=m['elements'][:1]
            p=project(m,'Demo::action')
            self.assertEqual(p['coverage'],'partial')
            self.assertTrue(any('Inherited behavior' in w['reason'] for w in p['warnings']))

    def test_wrong_target_invalid_report_and_limit(self):
        for m,target,limit in [(model(),'absent',120),({**model(),'staticChecksPassed':False},'Demo::state',120),
                                (model(),'Demo::state',1),(model(),'Demo::state',False)]:
            with self.assertRaises(ValueError):project(m,target,limit)

    def test_duplicate_ids_rejected(self):
        m=model();m['elements'].append(copy.deepcopy(m['elements'][0]))
        with self.assertRaises(ValueError):project(m,'Demo::state')

    def test_same_names_do_not_merge_identity(self):
        m=model();m['elements'][1]['name']=m['elements'][2]['name']='region'
        p=project(m,'Demo::state');self.assertEqual(len([n for n in p['nodes'] if n['name']=='region']),2)
        self.assertIn('URL="psysml:a"',graph_dot(p));self.assertIn('URL="psysml:b"',graph_dot(p))

    def test_quotes_are_not_topology_and_input_is_unchanged(self):
        m=model();m['elements'][1]['name']='x" -> fake;'
        before=copy.deepcopy(m);text=graph_dot(project(m,'Demo::state'))
        self.assertIn('fake',text);self.assertEqual(m,before)

if __name__=='__main__':unittest.main()
