#!/bin/sh
set -eu
mkdir -p artifacts/reference
docker run --rm --platform linux/amd64 --network none --entrypoint python3 \
  -v "$PWD/tools:/tools:ro" -v "$PWD/artifacts/reference:/evidence" \
  openvote-crypto:3.3.0 /tools/test_reference.py /evidence
