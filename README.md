# Відкритий голос

Незалежна відкрита платформа добровільних голосувань із підтвердженням права участі та можливістю незалежно перевірити результати.

**Development work in progress. This repository is not a completed release.** Only explicitly synthetic identities and test ballots are in scope. It is not a state service, official election, binding referendum or representative survey. Real politically sensitive participation is not enabled.

Requirements: [product and engineering contract](docs/REQUIREMENTS.md), [mandatory adversarial controls](docs/REQUIREMENTS-A15.md).

Implementation and verification status: [progress](docs/PROGRESS.md). Architecture choices: [decisions](docs/DECISIONS.md).

The first implemented slice runs **unmodified Belenios 3.3.0 cryptography** with five synthetic participants, a 2-of-3 threshold **plus a mandatory trustee**, final-vote enforcement and offline public verification. The web application is still under development. The fixed roster does not support adding a genuinely new person after opening; see [protocol compatibility](docs/adr/0001-reference-core.md).

The application slice now includes synthetic identity providers A/B, separate PostgreSQL stores, client encryption, final ballot acceptance, trustee finality checks, public results and a Ukrainian React interface. It is still **incomplete development work**, with remaining acceptance criteria recorded in [progress](docs/PROGRESS.md).

For the local application, install Node **24.20.0**, pnpm **10.33.0**, Docker Compose and Python 3, then run from the cloned repository:

```sh
pnpm install --frozen-lockfile
pnpm bootstrap
pnpm dev
```

In another terminal:

```sh
pnpm smoke
pnpm seed
pnpm test
pnpm types
pnpm build
```

Open [the local application](http://localhost:5173). `seed` creates one immutable seven-day synthetic poll and is idempotent. Select a predefined `TEST-PERSON` identity; never supply real documents. Person 0012 is the test moderator. Other fixtures include a non-owner, a minor and a non-UA citizen to exercise explicit eligibility rules. Session refresh requires re-identification; it never resets voting rights. Generated credentials and trustee files are private, ignored `.runtime/` data. Do not publish that directory.

The integration tests use live local services and native cryptography. They remove only the poll fixtures they created. Interactive browser checks reuse the existing in-app Browser and are separate from the CLI tests. The full E2E command and final release instructions are not yet delivered.

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
