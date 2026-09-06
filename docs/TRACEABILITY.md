# Requirements traceability

GitHub Issues/Projects are the execution status authority. `backlog.json` maps all declared sections and epics to actual issues. This table points to implementation evidence without prematurely closing the complete product.

| Requirement | Issue | Implementation | Test / evidence | Actual state |
|---|---|---|---|---|
| Public repository / board / backlog | [V002](https://github.com/Lontkovsky/vidkrytyi-holos/issues/13) | scripts/sync-backlog.py, scripts/sync-board.py | 41 items, public readback, anonymous HTTP 200, native sub-issues | Implemented; traceability evolves with subsequent PRs |
| Reference protocol comparison | [V003](https://github.com/Lontkovsky/vidkrytyi-holos/issues/14) | docs/adr/0001-reference-core.md, docs/THREAT_MODEL.md | Pinned upstream source inspection | Implemented; external review remains separate |
| Native encrypted ballot / threshold / verifier | [V004](https://github.com/Lontkovsky/vidkrytyi-holos/issues/15) | tools/reference.py, tools/verify.py | tools/test_reference.py; artifacts/reference/reference-report.json; official demo-threshold.sh | Locally verified; PR/CI pending |
| Final duplicate / invalid proof handling at core boundary | [V008](https://github.com/Lontkovsky/vidkrytyi-holos/issues/19) | reference accept wrapper | Real repeated and damaged ballots rejected | Partial: concurrent persistent API and browser not implemented yet |
| All remaining product and attack controls | [Issues](https://github.com/Lontkovsky/vidkrytyi-holos/issues) | Defined in original requirements and backlog | No implementation evidence yet | Open, not a development release |
| Admission of new person after opening | [V030](https://github.com/Lontkovsky/vidkrytyi-holos/issues/41) | Belenios requires a frozen credential set | Compatibility ADR | Not supported by selected integration; requirement unfulfilled |
| Production readiness | [E10](https://github.com/Lontkovsky/vidkrytyi-holos/issues/11) | Separate milestone | No external contracts, independent operators or audits claimed | Open |
