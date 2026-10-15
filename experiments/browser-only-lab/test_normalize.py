"""Negative adapter boundaries and ownership/witness preservation, without a language runtime."""
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent/'public/python'))
from normalize import normalize

class NormalizeTests(unittest.TestCase):
    def test_duplicate_or_malformed_identity_is_rejected(self):
        for rows in ([{'@id':'x','@type':'PartUsage'}]*2,
                     [{'@id':'','@type':'PartUsage'}],
                     [{'@id':'x','@type':None}],
                     [{'@id':'x','@type':'PartUsage','owner':'not-a-reference'}]):
            with self.subTest(rows=rows),self.assertRaises(ValueError):normalize(rows,'')
        with self.assertRaises(ValueError):normalize({},'')

    def test_same_names_keep_distinct_identity_and_owner_order(self):
        rows=[{'@id':'a','@type':'PartUsage','declaredName':'Unit','owner':{'@id':'root'}},
              {'@id':'root','@type':'PartDefinition'},
              {'@id':'b','@type':'PartUsage','declaredName':'Unit','owner':{'@id':'root'}}]
        result=normalize(rows,'')['elements']
        self.assertEqual([e['sessionElementId'] for e in result],['a','root','b'])
        self.assertEqual([r['id'] for r in result[1]['semantics']['ownedElement']],['a','b'])
        self.assertEqual(result[0]['name'],result[2]['name'])

    def test_multibyte_source_witness_uses_byte_columns(self):
        text='part café;\n'
        rows=[{'@id':'cafe','@type':'PartUsage','sysx:sourceLine':1,'sysx:sourceEndLine':1,
               'sysx:sourceColumn':1,'sysx:sourceEndColumn':len(text.rstrip().encode())+1}]
        self.assertEqual(normalize(rows,text)['elements'][0]['source'],'part café;')

    def test_entry_declaration_preserves_identity_without_inventing_action(self):
        rows=[{'@id':'state','@type':'StateDefinition'},
              {'@id':'entry','@type':'StateSubactionMembership','kind':'entry','owner':{'@id':'state'}},
              {'@id':'stopped','@type':'StateUsage','owner':{'@id':'state'}},
              {'@id':'initial','@type':'SuccessionAsUsage','owner':{'@id':'state'},
               'sysx:sourceMember':{'@id':'entry'},'targetFeature':[{'@id':'stopped'}]}]
        result={e['sessionElementId']:e for e in normalize(rows,'')['elements']}
        self.assertEqual(result['state']['semantics']['entryDeclaration'][0]['id'],'entry')
        self.assertNotIn('entryAction',result['state']['semantics'])
        self.assertEqual(result['initial']['semantics']['source']['id'],'entry')
        self.assertEqual(result['initial']['semantics']['target'][0]['id'],'stopped')
        rows[3]['owner']={'@id':'other'}
        self.assertNotIn('source',normalize(rows,'')['elements'][3]['semantics'])

    def test_subaction_keeps_membership_owner_and_missing_fields_unknown(self):
        rows=[{'@id':'state','@type':'StateUsage'},
              {'@id':'entry','@type':'StateSubactionMembership','kind':'entry','owner':{'@id':'state'},
               'memberElement':{'@id':'action'},'ownedRelatedElement':[{'@id':'action'}]},
              {'@id':'action','@type':'ActionUsage','owner':{'@id':'entry'}}]
        result=normalize(rows,'')['elements']
        self.assertEqual([r['id'] for r in result[0]['semantics']['entryAction']],['action'])
        self.assertEqual(result[2]['semantics']['owner']['id'],'entry')
        self.assertNotIn('doAction',result[0]['semantics'])
        self.assertNotIn('isParallel',result[0]['semantics'])

    def test_typed_subject_chain_retains_root_and_repeated_terminal_identity(self):
        rows=[{'@id':'plant','@type':'PartUsage'}, {'@id':'unit','@type':'PartUsage'},
              {'@id':'assertion','@type':'SatisfyRequirementUsage','isNegated':False,
               'lab:subjectChain':[{'@id':'plant'},{'@id':'unit'}]}]
        result=normalize(rows,'')['elements'][2]['semantics']
        self.assertEqual([r['id'] for r in result['satisfyingFeatureChain']],['plant','unit'])
        self.assertIs(result['isNegated'],False)
        self.assertNotIn('satisfyingFeatureChain',normalize(rows[:1],'')['elements'][0]['semantics'])

    def test_conjugated_typing_uses_actual_conjugate_identity(self):
        rows=[{'@id':'base','@type':'PortDefinition'},
              {'@id':'conjugate','@type':'ConjugatedPortDefinition'},
              {'@id':'typing','@type':'ConjugatedPortTyping','type':{'@id':'conjugate'}},
              {'@id':'port','@type':'PortUsage','type':[{'@id':'base'}],'ownedTyping':[{'@id':'typing'}]}]
        self.assertEqual(normalize(rows,'')['elements'][3]['semantics']['type'][0]['id'],'conjugate')
        rows[2]['type']={'@id':'missing'}
        self.assertEqual(normalize(rows,'')['elements'][3]['semantics']['type'][0]['id'],'base')

    def test_effective_attribute_name_keeps_engine_identity_and_rejects_conflict(self):
        rows=[{'@id':'a','@type':'AttributeUsage','qualifiedName':'P::@1','ownedRedefinition':[{'@id':'r'}]},
              {'@id':'r','@type':'Redefinition','redefiningFeature':{'@id':'a'},'redefinedFeature':{'@id':'tag'}},
              {'@id':'tag','@type':'AttributeUsage','declaredName':'assetTag'}]
        result=normalize(rows,'')['elements'][0]
        self.assertEqual(result['name'],'assetTag')
        self.assertEqual(result['qualifiedName'],'P::@1')
        self.assertEqual(result['sessionElementId'],'a')
        rows += [{'@id':'s','@type':'Redefinition','redefiningFeature':{'@id':'a'},'redefinedFeature':{'@id':'other'}},
                 {'@id':'other','@type':'AttributeUsage','declaredName':'different'}]
        rows[0]['ownedRedefinition'].append({'@id':'s'})
        self.assertIsNone(normalize(rows,'')['elements'][0]['name'])

if __name__=='__main__':unittest.main()
