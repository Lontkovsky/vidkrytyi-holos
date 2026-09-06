#!/usr/bin/env python3
"""Bounded repository hygiene scan, not a guarantee that every secret is known."""
import pathlib
import re
import subprocess
import sys
import tarfile

root = pathlib.Path(__file__).resolve().parents[1]
paths = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard'], cwd=root, text=True).splitlines()
patterns = [r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----', r'gh[pousr]_[A-Za-z0-9]{30,}', r'AKIA[0-9A-Z]{16}']
failures = []
for name in paths:
    path = root / name
    if not path.is_file():
        continue
    if any(name.endswith(x) for x in ['.privcreds', '.privkey', '.key', '.pem', '.dump']):
        failures.append(name + ': private artifact filename')
    if path.suffix == '.bel':
        with tarfile.open(path) as archive:
            for member in archive.getmembers():
                if member.isfile():
                    content = archive.extractfile(member).read().decode()
                    if 'TEST-PERSON-' in content or any(re.search(p, content) for p in patterns):
                        failures.append(name + ': identity or secret in public archive')
    else:
        try:
            content = path.read_text()
        except UnicodeDecodeError:
            continue
        if any(re.search(p, content) for p in patterns):
            failures.append(name + ': credential pattern')
print('\n'.join(failures) if failures else f'Public artifact hygiene: PASS ({len(paths)} tracked/unignored paths; bounded patterns).')
sys.exit(bool(failures))
