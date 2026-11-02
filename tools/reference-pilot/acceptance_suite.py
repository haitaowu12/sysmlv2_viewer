#!/usr/bin/env python3
"""Reproduce bounded multi-input authoring acceptance against the pinned engine."""
import argparse
from collections import Counter
import json
from pathlib import Path
import subprocess
import sys
from check_contract import check_contract
from check_evidence import check_evidence
from model_facts import signature
from receipts import bind_receipt, sha
from run_reference import run_reference

ROOT=Path(__file__).resolve().parents[2]

def check_views(report):
    """Check all six requested concerns, not merely six successful SVG entries."""
    expected = Counter([
        (('CoolerStudy::context',), 'INTERCONNECTION', True),
        (('CoolerStudy::Cooler',), 'TREE', False),
        (('CoolerStudy::Cooler',), 'INTERCONNECTION', True),
        (('CoolerStudy::Regulate',), 'ACTION', False),
        (('CoolerStudy::capacityRequirement',), 'TREE', False),
        (('CoolerStudy::CapacityVerification',), 'TREE', False),
    ])
    views = report.get('views', [])
    actual = Counter((tuple(v.get('targets', [])), v.get('view'), bool(v.get('notationProfile'))) for v in views)
    ids = [v.get('id') for v in views]
    return (actual == expected and len(ids) == len(set(ids))
            and all(isinstance(i, str) and i for i in ids)
            and bool(report.get('sourceSha256'))
            and all(v.get('modelSha256') == report['sourceSha256'] for v in views)
            and not any(v.get('error') for v in views)
            and all(not v.get('excluded') for v in views if v.get('notationProfile')))


def check_exchanges(sig):
    # Independent multiplicities from the input, not a set of generated edges.
    expected = Counter([
        ('CoolerStudy::Cooler::probe','readings','CoolerStudy::Cooler::controller','readings','TemperatureReading'),
        ('CoolerStudy::Cooler::controller','cooling','CoolerStudy::Cooler::actuator','cooling','CoolingCommand'),
        ('CoolerStudy::context::operator','enable','CoolerStudy::context::cooler','enable','EnableCommand'),
    ])
    actual = Counter((src[0],src[1],dst[0],dst[1],item)
                     for _,_,flows in sig['facts']['structures'] for src,dst,item in flows)
    return actual == expected


def main():
    p=argparse.ArgumentParser(description=__doc__)
    for name in ['jar','library','output']:p.add_argument('--'+name,type=Path,required=True)
    a=p.parse_args();a.output.mkdir(parents=True,exist_ok=False)
    fixture=ROOT/'fixtures/authoring/cooler'
    contract=json.loads((fixture/'contract.json').read_text());trials=[]
    for kind in ['architecture','interfaces','conversation']:
        result_dir=a.output/kind
        command=[sys.executable,str(ROOT/'tools/reference-pilot/qualify.py'),'--jar',str(a.jar),'--library',str(a.library),
                 '--source',str(fixture/kind/'model.sysml'),'--views',str(fixture/kind/'views.json'),'--output',str(result_dir)]
        code,report=run_reference(command,a.output/(kind+'.log'),result_dir/'report.json')
        if code != 0 or not report.get('staticChecksPassed'):
            trials.append({'input':kind,'passed':False,'staticChecksPassed':report.get('staticChecksPassed'),
                           'failure':report.get('failure',{'kind':'qualification-failed','diagnostics':report.get('diagnostics',[]),'viewErrors':[v.get('error') for v in report.get('views',[]) if v.get('error')]})})
            continue
        ledger_path=fixture/kind/'evidence-contract.json'
        evidence=check_evidence(report,json.loads(ledger_path.read_text()),fixture/kind,json.loads((fixture/kind/'intake.json').read_text()))
        evidence=bind_receipt(evidence,result_dir/'report.json',evidence=ledger_path,intake=fixture/kind/'intake.json',contract=fixture/'contract.json')
        (result_dir/'evidence-check.json').write_text(json.dumps(evidence,indent=2)+'\n')
        checked=bind_receipt(check_contract(report,contract),result_dir/'report.json',contract=fixture/'contract.json',evidence=ledger_path,intake=fixture/kind/'intake.json');(result_dir/'contract.json').write_text(json.dumps(checked,indent=2)+'\n')
        sig=signature(report,['CoolerStudy::Cooler','CoolerStudy::context']);(result_dir/'signature.json').write_text(json.dumps(sig,indent=2)+'\n')
        view_checks=check_views(report) and all(v.get('artifactSha256')==sha(result_dir/v['file']) for v in report['views'])
        exchanges_passed=check_exchanges(sig)
        trials.append({'input':kind,'passed':code==0 and checked['passed'] and evidence['passed'] and view_checks and exchanges_passed,
                       'evidencePassed':evidence['passed'],'evidenceCoverage':{'covered':evidence['coveredDeclarations'],'required':evidence['requiredDeclarations']},
                       'staticChecksPassed':report['staticChecksPassed'],'diagnostics':len(report['diagnostics']),
                       'contractChecks':len(checked['checks']),'failedChecks':[v['id'] for v in checked['checks'] if not v['passed']],
                       'directedExchangesPassed':exchanges_passed,'viewChecksPassed':view_checks,'signature':sig['sha256']})
    result={'passed':all(t['passed'] for t in trials) and len(trials)==3 and all(t.get('signature') for t in trials) and len({t.get('signature') for t in trials})==1,
            'crossInputFactsEqual':len(trials)==3 and all(t.get('signature') for t in trials) and len({t.get('signature') for t in trials})==1,'trials':trials,
            'limits':'Three independent candidate generations of one fictional system; bounded common facts, not general language conformance or a statistical benchmark. Visual inspection remains separate.'}
    (a.output/'acceptance.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
    return 0 if result['passed'] else 2
if __name__=='__main__':raise SystemExit(main())
