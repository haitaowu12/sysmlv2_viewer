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

if __name__=='__main__':unittest.main()
