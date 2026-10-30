"""Bind CLI and suite judgments to the same artifacts and implementation bytes."""
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
IMPLEMENTATION = ('report_integrity.py', 'review_routes.py', 'receipts.py', 'check_contract.py', 'check_evidence.py', 'engineering.py',
                  'model_facts.py', 'run_reference.py', 'acceptance_suite.py', 'assess_package.py', 'pump_regressions.py',
                  'qualify.py', 'source_set.py', 'ReferencePilot.java', 'lab.py', 'lab.html', 'capacity_analysis.py', 'stakeholder.py')


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def bind_receipt(result, report, *, contract=None, evidence=None, intake=None, report_data=None, input_digests=None):
    result = dict(result)
    result['receiptSchemaVersion'] = 1
    result['receiptRole'] = 'assessment-of-supplied-report'
    result['implementationBindingMeaning'] = 'Current assessor bytes, not proof of the producer of a previously generated report. qualificationInputsSha256 identifies the supplied producer-input record when present.'
    from report_integrity import load_report
    integrity = load_report(report, require_managed=False)['reportIntegrity']
    if report_data is not None and integrity['reportSha256'] != report_data.get('reportIntegrity', {}).get('reportSha256'):
        raise ValueError('Report changed after assessment; receipt would bind different facts')
    result['reportSha256'] = integrity['reportSha256']
    result['producerIntegrity'] = integrity
    result['implementationSha256'] = {name: sha(HERE/name) for name in IMPLEMENTATION}
    result['runtimeLockSha256'] = sha(HERE.parents[1]/'config/reference-pilot-lock.json')
    qualification = Path(report).parent/'inputs.json'
    if qualification.is_file():
        result['qualificationInputsSha256'] = sha(qualification)
    for label, path in [('contract', contract), ('evidence', evidence), ('intake', intake)]:
        if path is not None:
            current = sha(path)
            if input_digests is not None and current != input_digests.get(label):
                raise ValueError('Assessment input changed before receipt binding: ' + label)
            result[label+'Sha256'] = current
    return result
