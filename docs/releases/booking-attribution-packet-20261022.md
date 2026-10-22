# Booking attribution packet — prepare only, 22 October 2026

Scope: isolated technical packet requested by the authorized CRM coordination chat. No publication, service switch, real booking, staff configuration or MAX message was performed. Owner visual/copy/favicon revision `114684e51d3766cfca3b56006b3052441d57d851` remains in its separate worktree and Gmail approval flow.

Dedicated worktree: `/Users/konstantin/.codex/worktrees/booking-attribution-packet-20261022/CRM`, branch `codex/booking-attribution-packet-20261022`, source base `f88aba9451bddfb0d3cfe52cdaa31bd48ae31e41`. Do not deploy the entire source tree: its other compiled files and full owner JS have unrelated local drift.

Observed live baseline:

- RU host `msk-1-vm-d817`; gateway `sha256:339981be14103cd2ad16d26c71d93d80c058e89b0d3ca2bb5a61ea6f2ecf14fb`, reference `temichevvet-owner-gateway:clinic-catalog-context-20261022-v1`.
- Mandatory clinic JS SHA256 `22ab1c61e24d6fb0cc51b15d2002e6b03418a7a7af131d110339fc371d21f80e` preserved.
- Grooming `grooming-jtbd-20261021-r4`: actual tree 123 files including previously retained chunks. Hotel `pet-hotel-site-20261022-rates-r2`: 26 files.
- Public grooming catalogue remains closed, 172 services and zero specialists. No staff/shifts or self-booking activation belongs to this packet.
- Final read-only inspection at 07:43 UTC preserved all 277 gateway files, runtime/config hashes, named PostgreSQL/backup identities, both static pointers/trees and all Nginx site files.

Payload:

- Seven attribution runtime modules compiled from `f88`, plus one BOOK-only insertion in each exact live owner JS. No whole local owner-JS overwrite. Unrelated inferred declaration reordering is discarded; the changed storefront declaration receives only its new optional argument.
- Gateway compatible rollback keeps five tolerant reader/queue modules and the exact same command normalization/fingerprint. It restores baseline new-draft creation, omitting only new draft metadata; existing drafts, operations and confirmations remain readable.
- Grooming baseline Vite output matches every live baseline output byte. Candidate changes one hashed JS and its one HTML reference; all old chunks remain. Hotel changes only two JS files, the uniquely named shared helper and release metadata. No photographs, CSS, rates, text, layout or favicons from `114` are included.
- Both static rollback trees retain all new asset URLs. Bare `339981be` is not a safe reader rollback after new optional metadata clients have run.

Evidence in `output/booking-attribution-packet-20261022/qa`:

- Nine actual-payload bridge groups passed, including forward drafts, same-owner claims, pending BOOK, reconnect, gateway+clinical compatible rollback, lost-response replay, same-key DONE receipt and continued cached new-client booking after rollback.
- Four synthetic grooming and four hotel reservations survived DB reopen without duplicates. Original prices/source and hotel saved 700 rate survived later room-rate change and moves; zero medical appointments/payments/real MAX messages. Two isolated empty PostgreSQL DBs; dedicated labelled test container removed; shared containers preserved.
- 302 actual static HTTP responses passed status/hash checks in forward and rollback trees, including every retained new JS/helper URL.
- Thirteen publisher safety tests passed (tampering, image/config/service drift, exact root/clinical review gate, partial switch recovery to compatible targets, refusal to roll back a later configuration); four URL/storage attribution tests passed.
- Clinical tested overlays: exact forward 36 and compatible rollback 21 compiled files from the coordinated API packet. Raw schema `0d070ce0576b65411814dfeffc7aa1a89a46eb5a58d13398288db0dee09d9c49`; pinned Prisma 6.19.3 formatting yields qualified schema `5efcc8d4cea0ebb230905a928c60f14b960622f9b85b40c775dd85dacb6e3ad5` byte for byte. Compiled files remain unchanged in the r2 qualification. Tested and qualified manifest hashes are both recorded, not silently replaced.

The immutable final directory is `output/booking-attribution-packet-20261022/booking-attribution-20261022-r1`. Its `checksums.json` binds every shipped byte. `release.json`, runtime/source diffs, exact baseline/target file manifests, QA evidence, and `publish.py` are included. The final archive/checksum receipt is outside that immutable directory.

Root must review this packet and the clinical Prepare/image/replay receipts before any host mutation. An external root review receipt must bind this packet, the qualified clinical manifest/references, exact forward and compatible image IDs, and compatible rollback acceptance. The publisher blocks missing or mismatched review. The backup restore clone has 512 MiB RAM/swap, 0.5 CPU and 128-process limits plus checked task/release labels. Image-pin writes use a same-directory GUID temporary file, private permissions, fsync and atomic replace; validation failure restores guarded known configuration without overwriting a concurrent external edit. Its ordered operation is build → restore-tested fresh backup → root Apply; no migration/database restore is used by gateway/static publication or rollback. The clinical API owner coordinates its separate additive two-column migration and consumers. No automatic API Apply is part of this packet.

Real live booking/MAX/device acceptance and owner approval of the new visual revision are separate remaining gates. This local technical package does not establish either.
