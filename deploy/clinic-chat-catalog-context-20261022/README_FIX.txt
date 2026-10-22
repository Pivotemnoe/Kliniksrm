Clinic catalog request context correction — PUBLISHED AND VERIFIED 2026-10-22

Contract
1. Recognize only SITE_CHAT messages made by the existing priceSelectionBooking
   helper: exact public catalog-list introduction plus its numbered first item.
2. After the existing row lock and duplicate-clientKey guard, clear only a
   check-up bookingDraft. Preserve chat history, name/phone/consent, ownership,
   unrelated booking drafts and every appointment/clinical record.
3. Clear before the existing HUMAN early return too: an already consented
   visitor must update the same CRM conversation, not carry a stale program.
4. Anonymous lists receive a deterministic saved-list/contact prompt. No staff
   request is created without existing reply contact or callback consent.
5. Do not confirm client-provided prices, appointments, medical advice or new
   marketing/MAX permissions. Existing clinical-intent handling has priority.
6. Explicit check-up continuation keeps the approved program, lab and prices.
   Replaying an older list clientKey cannot clear a newer selected program.

Scope
One TypeScript service patch and the corresponding single compiled JS file.
The existing source map and all other dist files are retained unchanged.
No DTO, API shape, schema, migration, check-up data, policy, catalog, queue,
grooming/hotel/static website or environment change.
This is a narrow explicit-catalog handoff, not a general new topic classifier.

Provenance
The unmodified TypeScript copy rebuilt to exactly the current production
clinic-chat.service.js SHA5eed0b… before editing. The compiled check-up module
also matches production. PATCH.json records full hashes and image base.
The fix is compiled with the existing TypeScript settings, not hand-edited JS.
The minimal tracked source fix is commit b6e8c9fd18dd9a86cf821b8be594c4aac9052f60.
Its preceding baseline-capture commit is not needed by an already current tree.
The public evidence contains only synthetic QA identifiers/counts, no contacts,
cookies, secrets, customer records or database dump.

Actual backend regression
Tests use real minimal Nest controllers, the patched compiled service, a real
ClinicConversationSyncService and two isolated PostgreSQL databases. They do
not import the main application, register a model worker or call messengers.
No production question/contact has been sent. See evidence/context-regression.json.

Reproduction prerequisites
Use the existing runtime checkout whose compiled gateway baseline matches
PATCH.json. Set CLINIC_CONTEXT_QA_RUNTIME_ROOT to that checkout if this folder
is in an isolated worktree. The generated client is taken from the SAME dist
tree as the controllers/service, avoiding duplicate Prisma runtime identities.
Local DBs: clinic_context_form_qa, clinic_context_crm_qa on127.0.0.1:15498,
user clinic_qa, dummy password local-only-qa-20261022. Push the matching schemas
with --skip-generate to those NEW databases only; do not use an existing CRM DB.
Start tests/local-server.mjs, then tests/context.integration.mjs. Repeated runs
preserve all QA data and measure newly created requests; restart only this QA
process if its intentionally retained session rate limiter needs a reset.
This fixture requires an already built baseline runtime, not an autonomous CI
build from a historical backend source branch.

Release gate
Published in the separately reviewed gateway window with the exact approved
publisher/rollback hashes in PATCH.json. Fresh image, file manifests, health and
protected-state evidence passed; root independently repeated read-only checks.
One gateway JS changed. No API/Web/CRM data/tunnel/JTBD changes were made.
The isolated branch contains the tracked source fix for future full builds.

Recovery verification
The publisher's backup-only mode was executed on RU on 2026-10-22. A fresh
private pg_dump was actually restored with pg_restore --exit-on-error into a
network-disabled, port-free, resource-limited QA PostgreSQL container. All 32
public tables were restored; the QA container and its anonymous volume were
removed afterward. Production protected-state fingerprints matched before/after.
No clinical/customer data or dump left RU. See evidence/restore-preflight.json.
Apply repeats this verification on its own fresh private backup before switching.
Image rollback never restores a database or overwrites newly received requests.

The standalone rollback additionally requires the exact new image ID recorded
by this Apply, patched JS and unchanged 276-file dist manifest, and exact .env
and compose hashes recorded after this Apply. It refuses subsequent drift.
The exact approved script is also retained privately on RU at
/opt/temichevvet-owner-gateway/backups/clinic-catalog-context-20261022-v1/rollback-ru.sh.
Run it only after resolving the target and rechecking a requested rollback.
