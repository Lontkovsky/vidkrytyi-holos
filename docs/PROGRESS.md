# Actual progress

## 2026-09-06 — initial reproduction

The selected directory was empty, not a Git repository, with no application, tests, migrations or local instructions. There is no existing user behavior to preserve. Both user requirement attachments have been read. Docker is available. GitHub connector and authenticated CLI both identify `Lontkovsky`; repository name availability was checked.

Current work: repository bootstrap and requirements backlog, followed by the mandatory real-cryptography vertical slice. No implementation test, external audit, deployment, release, or production readiness is claimed yet.

## Reference slice evidence

- Public repository: https://github.com/Lontkovsky/vidkrytyi-holos. Public board: https://github.com/users/Lontkovsky/projects/5. The board returned HTTP 200 without credentials with the actual project title. Private vulnerability reporting was enabled and read back as `enabled: true`. Bootstrap main had no branch protection; no existing rules were bypassed.
- 11 epics and 30 vertical issues created, with separate Development release and Production Readiness milestones. `docs/backlog.json` contains actual issue URLs.
- Pinned Belenios 3.3.0 native executable and its original browser library compiled successfully in Docker. `belenios-tool --version` returned `3.3.0 (3.3.0)`.
- The official unmodified `tests/tool/demo-threshold.sh` completed successfully: setup, ballots, upstream revotes, finality, threshold plus mandatory decryption, result and reference verification. This is an upstream compatibility check; our final-vote API separately forbids revotes.
- `sh scripts/test-reference.sh`: twelve actual checks passed, with five synthetic encrypted votes producing `[[3,1,1]]`. These include corrupt ciphertext, corrupt zero-knowledge proof and a forged result in a structurally/hash-consistent archive. The report and safe public archive are in `artifacts/reference/`. The initial test expected string counts; upstream returned numeric counts, so the test contract was corrected without changing/normalizing the reference output.
- This remains an incomplete development product: provider/application APIs, database, browser journey, full A01–A11 guards, observer, release and production work are not yet complete.

## Continue from here

Read the current GitHub issues/board and working tree before proceeding. Do not create duplicate repositories, projects or issues. Preserve uncommitted changes. Record each verified command with its actual outcome and source revision.
