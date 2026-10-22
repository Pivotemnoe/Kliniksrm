# Avito grooming dialogue release tooling

The York price enquiry previously missed spaced wording such as `по чем` and could fall through to a generic grooming answer. The handler now selects the breed and service from the current CRM catalogue, answers a known price first, and asks a concrete follow-up for ordinary unclear messages while retaining bot control. Manual staff takeover, urgent care and callback refusal still take precedence.

Functional source: `13d85eb26eeced9c44b5ef056ba571ea0faf3d71`. The separate price correction in `8dbc240` records the owner-confirmed York full package at **2,500 RUB**, without another 300 RUB increase. Runtime replies load current database rows, so this price correction does not require an API restart. The embedded default catalogue is a seed/fallback source; importing prices preserves existing CRM rows.

## Files

- `publisher.ps1`: operator template derived from the reviewed Windows PowerShell 5.1 publisher. It retains API-only scope, protected-service identity checks, exact configuration hashes, full compiled-file/schema/client/migration/price checks, and a recoverable phase journal.
- `runtime-probe.cjs`: read-only runtime and database evidence. The publisher injects the private account scope.
- `offline-smoke.cjs`: isolated candidate-image smoke checks with synthetic listing/contact data. An explicit synthetic QUOTE row keeps unknown-price behavior testable independently of the live York price.
- `publisher-io-qa.ps1`: imports the actual publisher functions into a temporary fixture, substitutes Docker, and exercises 16 failure/recovery scenarios. It refuses real Docker calls. An optional private compose fixture is read only.
- `verification.json`: sanitized results. Exact deployment targets, approvals, configuration, state, row captures and full inventories stay in the operator's private evidence directory.

## Operator contract

The private JSON plan supplies `expectedComputerName`, `root`, `release`, `candidateReference`, `archivePath`, `archiveSha256`, `sourceCommit`, `accountId`, `settingsVersion`, `activePriceRows` and `entrypointSha256`. Keep the plan outside Git. Before use, bind the exact publisher, archive, manifest, original prepared state, candidate/base images and private configuration digests in the operator wrapper.

`Prepare` never activates the candidate. A reviewed `Apply` changes the two API pins and runs compose for the API service only, with no build or pull. It never seeds, migrates, edits prices, or restarts protected services. A lost Apply response must be resolved with `Verify`; do not blindly repeat Apply. Failed receipt storage must preserve a healthy verified candidate, and repeated Verify must not restart it.

`Rollback` accepts only the known reviewed base and exact retained service/configuration bindings. It can recover a crashed candidate without depending on a successful exec inside that candidate. Foreign image, tag, protected-service, compose or non-API configuration changes stop recovery before mutation.

After an independently authorized data change, retain the original immutable prepared state. Qualify a separate state copy against the audited data receipt, change only the specific expected data fingerprint, and use a separately reviewed Verify/Rollback companion with its own journal/receipt. Code rollback must retain the confirmed business data. Never disable a price guard or rewrite the original state to force verification to pass.

## Validation

Run the native IO harness on Windows PowerShell 5.1:

```powershell
.\publisher-io-qa.ps1 -PublisherPath .\publisher.ps1
```

The released handler passed 107 selected unit checks and 29 isolated PostgreSQL checks before activation. The price follow-up passed 31 focused unit checks and 15 isolated PostgreSQL checks, including persisted AUTO replies, current CRM overrides, unknown prices, callback source evidence, stale-price cancellation and exactly-once delivery through a fake Avito transport. Both the generic publisher and the post-price recovery companion passed all 16 native IO scenarios.

On the working server, full API/database invariants passed after activation and again against the separate post-price state. Read-only replay of the original enquiry returned 2,500 RUB followed by an Avito booking offer; polling continued without a connection error. A fresh public storefront and the rendered grooming price card also showed 2,500 RUB. No test messages were sent to real customers and no real conversation was modified for QA.
