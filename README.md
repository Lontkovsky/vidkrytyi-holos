# Відкритий голос

Незалежна відкрита платформа добровільних голосувань із підтвердженням права участі та можливістю незалежно перевірити результати.

**Development work in progress. This repository is not a completed release.** Only explicitly synthetic identities and test ballots are in scope. It is not a state service, official election, binding referendum or representative survey. Real politically sensitive participation is not enabled.

Requirements: [product and engineering contract](docs/REQUIREMENTS.md), [mandatory adversarial controls](docs/REQUIREMENTS-A15.md).

Implementation and verification status: [progress](docs/PROGRESS.md). Architecture choices: [decisions](docs/DECISIONS.md).

The first implemented slice runs **unmodified Belenios 3.3.0 cryptography** with five synthetic participants, a 2-of-3 threshold **plus a mandatory trustee**, final-vote enforcement and offline public verification. The web application is still under development. The fixed roster does not support adding a genuinely new person after opening; see [protocol compatibility](docs/adr/0001-reference-core.md).

To reproduce the current slice with Git, Docker and Python 3:

```sh
git clone --recurse-submodules https://github.com/Lontkovsky/vidkrytyi-holos.git
cd vidkrytyi-holos
docker build --platform linux/amd64 -f infra/crypto.Dockerfile -t openvote-crypto:3.3.0 .
sh scripts/test-reference.sh
sh scripts/verify.sh artifacts/reference/election.bel
python3 scripts/scan-public.py
```

Verification runs with Docker networking disabled and only the public archive mounted. Generated private material stays inside temporary container directories and is removed with the container. The exported `.bel` file contains ciphertexts and reference proofs, not named choices. `artifacts/reference/reference-report.json` records exactly which checks ran; this command does not test browser encryption or prove production security.

Public planning: [issues](https://github.com/Lontkovsky/vidkrytyi-holos/issues), [board](https://github.com/users/Lontkovsky/projects/5). `python3 scripts/sync-backlog.py` and `python3 scripts/sync-board.py` reconcile the declared backlog through an already authenticated `gh` CLI without printing tokens. Execution status remains on GitHub.

Own code is licensed **AGPL-3.0-only**. Third-party components retain their own licenses.
