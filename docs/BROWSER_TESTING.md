# Existing in-app Browser E2E

`pnpm test:e2e /absolute/download/directory` is a local coordinator. Supply the actual download directory configured for the existing Browser. It starts no browser, opens no CDP port and cannot pass from a previous report. Start `pnpm dev` first and keep the existing in-app Browser tab open. The command deletes only prior E2E poll IDs recorded in private `.runtime/e2e-polls.json`, after verifying their test-author marker. It does not delete the seed poll or arbitrary user content.

In the in-app Browser tool runtime, keep the existing tab binding and import the checked-in test module:

```js
const suite = await (await import("/absolute/checkout/tests/e2e/inapp.mjs")).createRunner(existingTab);
```

Execute each stage with `await suite.step(name)` in this order:

1. `create`
2. `reviewStart`
3. `review` after the submitted review completes
4. `voteOne`
5. `voteTwo`
6. `voteThree`
7. `duplicate`
8. `tallyStart` after the fixed `suite.closesAt` time
9. `publish` after the requested tally completes
10. `exports`
11. `providerContracts`
12. `providerRetry`
13. `providerSwitch`
14. `providerBothUnavailable`

Asynchronous review/tally start and completion are separate stages. Wait for real completion; do not change the fixed deadline or insert fabricated outcomes. Every browser action uses the supplied tab.playwright API. Public UI state is inspected after actions; no browser secrets or hidden application state are read. The native cryptographic tract is exercised, not mocked.

The four provider stages additionally use the private local coordinator to set A/B mock availability and count active attempts for the one fixed synthetic fixture. They do not authenticate through that control channel: login, error, retry, switching, capability disclosure and result navigation all execute through the UI. The attempt-count check returns only a count and proves that repeated failed deliveries did not create new attempts. Both mock processes are reset at setup and completion/interruption. Run live service tests before this suite, not concurrently, because they deliberately control the same synthetic providers.

The coordinator returns a nonzero exit code if a stage fails, sources change during the run, the run is interrupted, or it remains incomplete for 15 minutes. Safe outcomes are written to `artifacts/e2e/report.json` with run ID and initial/final source digests. The report starts as incomplete; an older successful report cannot survive a new failed attempt. A successful CLI/API test is not browser evidence. The regular GitHub workflow does not claim to run this suite because it does not have the existing in-app Browser session.

The export stage clicks the real UI and reads only newly completed files in the explicitly supplied download directory. It compares the actual downloaded question/version/counts/deadline with the scenario and extracts the unchanged native archive to `artifacts/e2e/election.bel`. Run `pnpm verify artifacts/e2e/election.bel` separately for native proof verification. This separation does not claim that JSON shape proves a tally. The Browser download-event wait timed out in a diagnostic run even though the file was saved with the correct contents; that run remains failed. No alternate browser or direct API download is used to replace the UI action.

Exports are exercised after signing out. JSON, CSV, SVG and audit downloads must contain the same complete result contract. The test uses Python standard-library CSV/XML parsers on the actual downloaded files, checks the visible result question, opens/closes the share preview by keyboard, verifies that the SVG image loaded, and retains the CSV/SVG as safe public evidence.

Earlier development runs exposed exact-label locator issues on populated form controls, asynchronous review timing, and a concrete catalog hit-area defect. A wrapped inline heading link had a bounding-box center in the parent H2 outside its two inline rectangles, so a center click did not navigate. DOM hit testing confirmed this. Heading links now occupy a contiguous block. Assertions use accessible roles, exact expected navigation and fresh DOM checks. None of the failed runs represented an accepted duplicate ballot.
