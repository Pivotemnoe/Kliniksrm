# Booking source contract - local candidate, 22 October 2026

This candidate is not deployed. It complements clinical commits `9e80eaa` and
`ee52c24` on `codex/pet-service-attribution-20261022`; those need their additive
migration and generated client before a coordinated release.

Public grooming/hotel URLs may contain `utm_source=avito&listing_id=<id>`.
Only one occurrence of each parameter is accepted. The id must match
`^[1-9]\d{0,19}$`. The browser passes only
`attribution: {source: 'AVITO', listingId: '<id>'}`. Arbitrary query parameters,
URLs, contact details and authentication tokens are never copied.

The browser retains this pair in module-specific session storage for 30 minutes.
Grooming and hotel do not inherit each other's source. A new invalid or incomplete
pair clears the same module's saved pair. Blocked storage does not block booking.

Flow: public selection -> opaque draft -> same-owner claim -> BOOK command ->
clinical creation. Gateway DTOs and command queues normalize the exact two-key
shape; malformed metadata is dropped without rejecting an otherwise valid
booking. RESCHEDULE/CANCEL strip the optional source. Existing CRM/CLIENT_PORTAL
and OWNER_PORTAL source enums, consent, identity, offers, quotes and MAX start
payloads remain unchanged. Clinical creation owns final persistence; retries and
rescheduling retain the original source.

Verification: browser allowlist/expiry/isolation tests; self-contained hotel ES
module package check; actual gateway draft/claim/command persistence with database
reconnect and idempotent retries on a newly created, subsequently removed local
PostgreSQL container. These checks do not send real MAX messages or confirm a real
reservation. Clinical persistence is verified separately by the CRM integration
owner. Combined local UI/bridge acceptance remains required before activation.
