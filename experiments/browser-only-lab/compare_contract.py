"""Compare captured browser output with the unchanged maintained alarm contract."""
import argparse,collections,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent
LAB=ROOT.parents[1]/'modeling-lab/workbench'
sys.path[:0]=[str(ROOT/'public/python'),str(LAB/'tools/reference-pilot')]
from normalize import normalize
from check_contract import check_contract
from view_scope import catalogue
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--evidence',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
a.output.mkdir(parents=True,exist_ok=True)
data=json.loads(a.evidence.read_text());checked=next(c for c in data['cases'] if c['id']=='valid-reviewed')
project=json.loads((LAB/'fixtures/authoring/alarm-review/reviewed.modeling.json').read_text())
report=normalize(json.loads(checked['apiJson']['content']),project['source'])
contract=check_contract(report,json.loads((LAB/'fixtures/authoring/alarm-review/contract.json').read_text()))
c=catalogue(report);root='AlarmReview::monitoringSystem'
relations=[r for r in c['relations'] if r['scope'].startswith(root)]
def key(r):return (r['kind'],r['source']['node'].removeprefix(root),r['source']['port'],r['target']['node'].removeprefix(root),r['target']['port'],r['item'])
expected=[]
for room in [0,1]:
    for kind,item in [('connection',''),('flow','TemperatureReading')]:expected.append((kind,f'/coldRoom{room}','readings','/controller',f'room{room}Readings',item))
    expected.append(('binding',f'/coldRoom{room}','readings',f'/coldRoom{room}/probeHead','readings',''))
for kind,item in [('connection',''),('flow','AlarmCommand')]:expected.append((kind,'/controller','alarm','/annunciator','alarm',item))
expected_nodes={'','/coldRoom0','/coldRoom0/probeHead','/coldRoom1','/coldRoom1/probeHead','/controller','/annunciator','/maintenancePanel'}
actual_nodes={n['key'].removeprefix(root) for n in c['nodes'] if n['root']==root}
projection={'scope':root,'observedNodes':len(actual_nodes),'observedRelations':len(relations),'nodeIdentityPass':actual_nodes==expected_nodes,'endpointIdentityPass':collections.Counter(map(key,relations))==collections.Counter(expected),'warnings':c['warnings']}
(a.output/'contract.json').write_text(json.dumps(contract,indent=2));(a.output/'projection.json').write_text(json.dumps(projection,indent=2))
print(json.dumps({'semanticChecks':sum(c['passed'] for c in contract['checks']),'semanticTotal':len(contract['checks']),**projection},indent=2))
sys.exit(0 if contract['passed'] and projection['nodeIdentityPass'] and projection['endpointIdentityPass'] else 1)
