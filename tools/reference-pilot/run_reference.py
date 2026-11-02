"""Run a qualification subprocess and retain explicit infrastructure failures."""
import json
from pathlib import Path
import subprocess


def run_reference(command, log_path, report_path, timeout=210):
    log_path, report_path = Path(log_path), Path(report_path)
    try:
        with log_path.open('w') as log:
            result = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, timeout=timeout)
        report = json.loads(report_path.read_text())
        if (not isinstance(report, dict) or type(report.get('staticChecksPassed')) is not bool
                or any(not isinstance(report.get(k), list) for k in ('elements', 'views', 'diagnostics'))):
            raise ValueError('Malformed qualification report')
        return result.returncode, report
    except (OSError, ValueError, subprocess.TimeoutExpired) as error:
        failed = {'staticChecksPassed': False, 'elements': [], 'views': [], 'diagnostics': [],
                  'failure': {'kind': type(error).__name__, 'message': str(error), 'log': str(log_path)},
                  'execution': 'not-evaluated'}
        report_path.parent.mkdir(parents=True, exist_ok=True)
        (report_path.parent/'failure.json').write_text(json.dumps(failed, indent=2)+'\n')
        return 2, failed
