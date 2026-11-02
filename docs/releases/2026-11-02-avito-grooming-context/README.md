# Grooming assistant request context — 2 November 2026

The assistant received a price/preparation question and then a short arrival question before replying. Its final decision used only the last fragment and repeated a breed question the customer had already answered. The deployed fix keeps consecutive unanswered customer messages together until an actual outgoing reply; drafts and cancelled operations do not end the request. Classification sees the entire pending request while name, callback consent and phone evidence remain tied to the original current messages.

The composer preserves organizational answers, including an address or chosen website channel. A reported completed parasite treatment updates the ongoing context even in a short follow-up. Negative flea/tick/parasite statements are distinguished from a current concern, and a different pet clears unrelated care/breed context. Unavailable toy-poodle pricing is explicitly referred to staff instead of borrowing the miniature-poodle price. The assistant does not select a medicine, invent a treatment price, prescribe a waiting interval or confirm an unverified slot.

Functional source: `3d384fef9b4b1d52513ed37202c8da6e55df8ee5`. The live API was switched and separately verified on 2 November. Read-only replay of the original two inputs used current CRM settings and price rows and covered preparation, stated age/variety and arrival without another breed question. Worker polling was observed after restart with no connection error. The original conversation remains under staff control. No customer messages or production records were created for testing. Prices and settings were preserved.

## Validation

- 105 focused unit checks and 18 isolated PostgreSQL checks passed.
- Four additional independent regression reproductions passed: address, short treatment update, negative tick statement and changed unknown breed.
- Twenty native PowerShell 5.1 IO/recovery scenarios passed, including code-binding byte/source/read-only drift and rollback with the inherited bindings.
- Full inventories, schema, Prisma/client, migration history, settings, prices, configuration and protected services matched the reviewed state.

## Release tooling

The reviewed operator template is in `scripts/avito/grooming-context-release/`. It uses a private plan and immutable prepared state, exact image/configuration/artifact guards and an atomic transition journal. Production identifiers, credentials, configuration contents, full inventories, raw conversations and approval receipts stay outside Git.

The running API had three inherited read-only compiled-code bindings for employee notifications. Both the original and candidate images were qualified offline with exactly those code bindings, with no network, database or credential mounts. Source paths, destinations, read-only flags and host file hashes are checked before transition or recovery. The resolved compose must recreate those same bindings; therefore rollback restores the qualified running baseline without copying or reverting employee-notification code. An image-only offline comparison cannot establish that baseline.

A lost Apply response is resolved with Verify, never a repeated blind Apply. A later business-data change requires its own audited correction and separately qualified expected state; do not weaken a price guard or overwrite the original prepared evidence. Only the API was recreated by this release. Web, gateway, business data, employee notification configuration and existing staff control were preserved.
