import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from source_intake import assemble_records,admit_source_set,presentation_mapping,source_locations,SOURCE_LIMIT
from source_set import assemble

class SourceIntakeTests(unittest.TestCase):
    def test_exact_existing_assembly_and_original_file_locations(self):
        records=[{'path':'b.sysml','source':'part b;'}, {'path':'a.sysml','source':'\ufeffpackage A;\r\n'}]
        result=assemble_records(records)
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            for item in records:(root/item['path']).write_bytes(item['source'].encode())
            manifest=root/'sources.json';manifest.write_text(json.dumps({'schemaVersion':1,'files':['b.sysml','a.sysml']}))
            expected=assemble(manifest,root/'joined.sysml')
            self.assertEqual(result['source'].encode(),(root/'joined.sysml').read_bytes())
            self.assertEqual(result['sourceMap'],expected)
        self.assertEqual(result['source'],'\ufeffpackage A;\r\npart b;\n')
        self.assertEqual(result['sourceMap'][1]['sha256'],hashlib.sha256(b'part b;').hexdigest())

    def test_admission_recomputes_mapping_and_binds_baseline(self):
        result=assemble_records([{'path':'a.sysml','source':'package A;'}]);metadata=result['sourceSet']
        self.assertEqual(admit_source_set({**metadata,'sourceMap':[{'path':'forged'}]})['sourceMap'],result['sourceMap'])
        with self.assertRaisesRegex(ValueError,'revision'):admit_source_set({**metadata,'assembledSourceSha256':'0'*64})
        with self.assertRaisesRegex(ValueError,'baseline'):admit_source_set(metadata,'other baseline')
        with self.assertRaisesRegex(ValueError,'Unsupported'):admit_source_set({**metadata,'schemaVersion':True})

    def test_edited_mapping_is_not_claimed_and_presentation_does_not_mutate_receipt(self):
        result=assemble_records([{'path':'a.sysml','source':'package A;'}]);metadata=result['sourceSet']
        report={'source':result['source'],'sourceSha256':metadata['assembledSourceSha256'],'reportIntegrity':{'reportSha256':'unchanged-receipt'},'elements':[{'sessionElementId':'part-a','line':1}],'diagnostics':[{'line':1,'message':'Example'}]}
        before=copy.deepcopy(report);mapped=source_locations(report,metadata)
        self.assertEqual(report,before)
        self.assertEqual(mapped['elements']['part-a']['path'],'a.sysml')
        self.assertEqual(mapped['diagnostics'][0]['originalSource']['line'],1)
        self.assertEqual(presentation_mapping(report['source']+'part b;',metadata)['sourceMap'],[])
        self.assertEqual(presentation_mapping(report['source'],metadata)['status'],'original')

    def test_unsafe_paths_duplicates_utf8_and_limits(self):
        for path in ['../a.sysml','/a.sysml','C:/a.sysml','a\\b.sysml','a/./b.sysml','a//b.sysml','a.txt','a\x00.sysml']:
            with self.subTest(path=path),self.assertRaisesRegex(ValueError,'relative'):assemble_records([{'path':path,'source':''}])
        with self.assertRaisesRegex(ValueError,'Duplicate'):assemble_records([{'path':'a.sysml','source':''}]*2)
        with self.assertRaisesRegex(ValueError,'1–64'):assemble_records([{'path':str(i)+'.sysml','source':''} for i in range(65)])
        with self.assertRaisesRegex(ValueError,'UTF-8'):assemble_records([{'path':'a.sysml','source':'\ud800'}])
        self.assertEqual(len(assemble_records([{'path':'a.sysml','source':'x'*(SOURCE_LIMIT-1)+'\n'}])['source'].encode()),SOURCE_LIMIT)
        with self.assertRaisesRegex(ValueError,'Assembled'):assemble_records([{'path':'a.sysml','source':'x'*SOURCE_LIMIT}])
        with self.assertRaisesRegex(ValueError,'Combined'):assemble_records([{'path':'a.sysml','source':'雪'*174763}])
        self.assertEqual(assemble_records([{'path':'𐀀.sysml','source':'second'},{'path':'\ue000.sysml','source':'first'}])['source'],'first\nsecond\n')

if __name__=='__main__':unittest.main()
