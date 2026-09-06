#!/bin/sh
set -eu
test "$#" -eq 1
archive_dir=$(cd "$(dirname "$1")" && pwd)
archive_file=$(basename "$1")
docker run --rm --platform linux/amd64 --network none --entrypoint python3 \
  -v "$PWD/tools:/tools:ro" -v "$archive_dir:/public:ro" \
  openvote-crypto:3.3.0 /tools/verify.py "/public/$archive_file"
