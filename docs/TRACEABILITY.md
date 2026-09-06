# Requirements traceability

GitHub Issues/Projects are the execution status authority. `backlog.json` maps all declared sections and epics to actual issues. This table points to implementation evidence without prematurely closing the complete product.

| Requirement | Issue | Implementation | Test / evidence | Actual state |
|---|---|---|---|---|
| Public repository / board / backlog | [V002](https://github.com/Lontkovsky/vidkrytyi-holos/issues/13) | scripts/sync-backlog.py, scripts/sync-board.py | 41 items, public readback, anonymous HTTP 200, native sub-issues | Implemented; traceability evolves with subsequent PRs |
| Reference protocol comparison | [V003](https://github.com/Lontkovsky/vidkrytyi-holos/issues/14) | docs/adr/0001-reference-core.md, docs/THREAT_MODEL.md | Pinned upstream source inspection | Implemented; external review remains separate |
| Native encrypted ballot / threshold / verifier | [V004](https://github.com/Lontkovsky/vidkrytyi-holos/issues/15) | tools/reference.py, tools/verify.py | tools/test_reference.py; artifacts/reference/reference-report.json; official demo-threshold.sh | PR #42 merged; reference CI passed |
| Final duplicate / invalid proof handling at core boundary | [V008](https://github.com/Lontkovsky/vidkrytyi-holos/issues/19) | reference accept wrapper | Real repeated and damaged ballots rejected | Partial: persistent concurrent API tested; browser encrypted vote and signed tracker checked; broader replay matrix pending |
| All remaining product and attack controls | [Issues](https://github.com/Lontkovsky/vidkrytyi-holos/issues) | Defined in original requirements and backlog | See current progress and attack-coverage.json for partial application evidence | Open, not a development release |
| Admission of new person after opening | [V030](https://github.com/Lontkovsky/vidkrytyi-holos/issues/41) | Belenios requires a frozen credential set | Compatibility ADR | Not supported by selected integration; requirement unfulfilled |
| Production readiness | [E10](https://github.com/Lontkovsky/vidkrytyi-holos/issues/11) | Separate milestone | No external contracts, independent operators or audits claimed | Open |

| Versioned eligibility and A/B identity | [V005](https://github.com/Lontkovsky/vidkrytyi-holos/issues/16) | apps/api/src/identity.ts, provider.ts | tests/services.test.ts, tests/domain.test.ts | Six local service/domain tests passed; current PR pending |
| Finality-aware local trustees | [V014](https://github.com/Lontkovsky/vidkrytyi-holos/issues/25) | scripts/trustee.ts, packages/domain/src/checkpoints.ts | real 1/1/1 result and early/final-set guards | Partial: full subset adversarial suite remains open |
| Browser client encryption and inclusion | [V012](https://github.com/Lontkovsky/vidkrytyi-holos/issues/23) | apps/web/src/PollPage.tsx, crypto.ts | same in-app Browser; desktop and 390px mobile inspected | Happy path manually verified; reusable E2E pending |
