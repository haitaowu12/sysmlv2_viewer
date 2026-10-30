"""Bind CLI and suite judgments to the same artifacts and implementation bytes."""
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
IMPLEMENTATION = ('receipts.py', 'check_contract.py', 'check_evidence.py', 'engineering.py',
                  'model_facts.py', 'run_reference.py', 'acceptance_suite.py', 'assess_package.py', 'pump_regressions.py',
                  'qualify.py', 'source_set.py', 'ReferencePilot.java', 'lab.py', 'lab.html', 'capacity_analysis.py', 'stakeholder.py')


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def bind_receipt(result, report, *, contract=None, evidence=None, intake=None):
    result = dict(result)
    result['receiptSchemaVersion'] = 1
    result['receiptRole'] = 'assessment-of-supplied-report'
    result['implementationBindingMeaning'] = 'Current assessor bytes, not proof of the producer of a previously generated report. qualificationInputsSha256 identifies the supplied producer-input record when present.'
    result['reportSha256'] = sha(report)
    result['implementationSha256'] = {name: sha(HERE/name) for name in IMPLEMENTATION}
    result['runtimeLockSha256'] = sha(HERE.parents[1]/'config/reference-pilot-lock.json')
    qualification = Path(report).parent/'inputs.json'
    if qualification.is_file():
        result['qualificationInputsSha256'] = sha(qualification)
    for label, path in [('contract', contract), ('evidence', evidence), ('intake', intake)]:
        if path is not None:
            result[label+'Sha256'] = sha(path)
    return result
