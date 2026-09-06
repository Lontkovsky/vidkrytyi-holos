#!/usr/bin/env python3
"""Verify an exported public archive without any private backend or key."""
import base64
import json
import pathlib
import sys
from reference import process

try:
    result = process({'action': 'verify', 'archive': base64.b64encode(pathlib.Path(sys.argv[1]).read_bytes()).decode()})
    print(json.dumps(result, ensure_ascii=False, indent=2))
except Exception:
    print('Public archive verification failed.', file=sys.stderr)
    raise SystemExit(1)
