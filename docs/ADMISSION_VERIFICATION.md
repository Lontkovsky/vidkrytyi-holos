# Frozen admission and replay verification

The current integration fixes the public credential roster and trustee keys before opening. Identity recovery delivers the same poll credential. Ballot acceptance invokes the unchanged Belenios verifier, while the application persists one final ballot per credential. These controls assume honest admission and authoritative storage; they do not prove the existence of a person from a valid signature.

## Reproduced boundaries

Before this test expansion, the native suite covered a damaged public credential and malformed proofs. It did not demonstrate rejection of a newly generated, internally valid credential from an unauthorized issuer or isolate environment/context binding while preserving the election UUID. The API already compared immutable registrations, but its credential-roster and trustee-key replacement paths had no dedicated regression evidence.

`tools/test_admission_variants.py` uses only the original credential generation, ballot generation and archive commands. Its temporary foreign private credential never leaves the helper; output consists of public archives and an encrypted ballot. It constructs a changed environment, changed official context, a fresh trustee set under the same UUID, another poll, and an expanded public roster. Each uncast archive independently passes native verification before use as a test fixture. No upstream format or voting primitive is changed.

`tools/test_reference.py` verifies that a genuine foreign credential is refused against the committed roster. An existing ballot is refused by another poll and by the same UUID with a changed environment, official context or trustee keys. Positive native tally, quorum and idempotency checks remain in the same run.

The live-service test suite also exercises the actual identity and ballot application factories against the separate PostgreSQL stores and real native verification transport:

- An identity service token cannot register a ballot election, and a ballot service token cannot register identity credentials.
- Byte-identical registration is idempotent; only one genesis checkpoint is created.
- Additional or reassigned private credentials and a changed manifest fingerprint are refused. The stored sealed credential rows remain identical.
- A valid native archive with an expanded public roster is refused for the registered election. A valid archive with changed context or trustee keys is also refused, and another environment cannot be registered.
- A genuine foreign ballot is refused without changing the registered archive. Identity cookies and user identifiers are refused at ballot intake.
- An authorized ballot is accepted; repeating the original setup does not roll back that accepted ballot. Replaying the ballot into another registered election is refused.

The application-factory checks use the same handlers, migrations and native bridge as the running application. They are API evidence, not browser interaction. The existing live HTTP scenario separately verifies concurrent delivery, cross-provider recovery, fixed deadlines and a complete threshold tally.

## Trust-root limitation

An additional native test deliberately supplies an expanded roster as the trusted input. The foreign credential then produces a valid accepted ballot. Its outcome is recorded as `KnownLimitation`, not `Rejected` or `Prevented`. An independently approved roster commitment and honest admission authority remain necessary; a tally cannot establish whether the issuer created a fictitious person. The native test does not demonstrate that ordinary API clients can replace an already registered roster.

The application registration guards do not constrain an operator who bypasses the application and replaces its storage and signing history. Independently trusted roster provenance, complete role/collusion evidence and recovery/backup controls remain open in #20, #31 and #33. Frozen-roster credential recovery does not revoke a credential that its holder already exported. Adding genuinely new people after opening remains the explicit incompatibility in #41.

## Reproduction

After the README bootstrap and local service startup:

```sh
pnpm exec vitest run tests/services.test.ts -t 'keeps the frozen roster'
pnpm test:crypto
pnpm test
pnpm verify artifacts/reference/election.bel
```

Public results are recorded in `artifacts/reference/reference-report.json` and `artifacts/services/tests.json`. The Browser run and its unresolved download gate are documented separately in `artifacts/e2e/README.md` and `docs/PROGRESS.md`. Passing these checks is not an external review or completion of the development release.
