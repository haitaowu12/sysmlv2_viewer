import json
from pathlib import Path
import tempfile
import unittest
from source_set import assemble,source_location
class SourceSetTests(unittest.TestCase):
    def test_deterministic_assembly_and_original_lines(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d);(p/'a.sysml').write_text('package A;\n');(p/'b.sysml').write_text('package B {\n part p;\n}')
            m=p/'set.json';m.write_text(json.dumps({'schemaVersion':1,'files':['b.sysml','a.sysml']}))
            mapping=assemble(m,p/'joined.sysml')
            self.assertEqual((p/'joined.sysml').read_text(),'package A;\npackage B {\n part p;\n}\n')
            self.assertEqual(source_location(3,mapping)['path'],'b.sysml');self.assertEqual(source_location(3,mapping)['line'],2)
    def test_duplicate_and_escape_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d);(p/'a.sysml').write_text('package A;')
            for files in [['a.sysml','a.sysml'],['../other.sysml']]:
                m=p/'set.json';m.write_text(json.dumps({'schemaVersion':1,'files':files}))
                with self.assertRaises(ValueError):assemble(m,p/'joined.sysml')
if __name__=='__main__':unittest.main()
