# Avito prices and booking source — 22 October 2026

The API release reads current grooming prices and carries the declared Avito
listing into grooming and hotel reservations. The existing reservation origin,
owner checks and saved rates remain intact. A separate compatible rollback
accepts cached clients and recovers receipts after a lost response.

The API passed its live checkpoint at **11:57 Moscow time on 22 October 2026**.
This is the API checkpoint before the coordinator's separate Web release; it is
not a claim about the later Web or gateway acceptance.

## Source and evidence

- Forward source: `7e4f6b0e946b2266147adcc429eb4ecc50f8ab50`.
- Compatible rollback source: `8d9fd7fe55b63792b443a02df5894ce6aa1a35e2`.
- [Digest and result summary](provenance.json) records the immutable image and
  protected evidence digests without production account/container identities,
  configuration values, authorization receipts or database contents.
- The complete sealed packet, approval and raw proofs remain with the operator
  in the server release/backup directories. The public summary does not replace
  the protected packet or authorize a deployment.

## Database and rollback contract

Only [migration 800](ops/migration.sql) adds two nullable JSONB fields. The scoped
publisher records that exact SQL checksum once, in the same transaction. It does
not run all pending migrations or seed data. The
[scoped startup](ops/api-scoped-entrypoint.sh) checks `SEED_ON_START=false` and
starts the existing API directly.

Rollback changes code to the reviewed compatible image. It retains both columns,
their values and migration history. The coordinated order is Web rollback first,
then API compatibility rollback. A rollback receiver may omit the new source on
new bookings; it preserves existing source values and idempotent receipts.
Priced outgoing operations tagged by the forward version stop before transport
and need another review; ordinary untagged replies retain their delivery checks.

## Validation performed

- 75 forward and 52 rollback unit checks inside the Linux images.
- 19 actual-image PostgreSQL checks covering lost-response BOOK/RESCHEDULE,
  cached clients, ownership, malformed metadata, preserved prices and outbox
  delivery through a fake transport.
- Four native Windows publisher I/O checks.
- Full backup restore and comparison across 152 tables before/after the additive
  migration and compatibility check. Both images started using their default
  entrypoint against that isolated copy; only the approved history entry was
  added. Test containers had no external network or published ports.
- Live verification kept the four data services and then-current Web instance
  unchanged. Manual customer messages and ad publication were outside this work.

## Reproduce a candidate without publishing operator state

Use Node.js and the operator's protected sealed packet outside the repository:

```sh
node docs/releases/2026-10-22-avito-prices-source/ops/prepare-overlay.mjs \
  --packet-root "$PRIVATE_PACKET" \
  --mode candidate \
  --compiled-dist "$COMPILED_DIST" \
  --output "$PRIVATE_BUILD_CONTEXT"
```

`COMPILED_DIST` may be a rebuilt output from the pinned source revision with the
same generated Prisma types. Every file must match the sealed byte checksum.
Omit that argument to use the operator's already reviewed compiled overlay.
Choose `rollback` for the 21-file compatibility overlay; the forward overlay has
36 files. The helper checks all 108 sealed artifacts and creates a fresh private
context outside Git. It does not start containers or alter the database.

Before an offline build, the operator must verify that the local baseline image
reference still resolves to the sealed baseline digest. Build only on the local
Linux amd64 engine with `--pull=false --network none` and a fresh QA tag. The
generated Dockerfile uses the installed Prisma 6.19.3 native toolchain, validates
the two-field model delta, preserves the unrelated compiled files and runs the
matching image unit suite. It installs no packages.

The recipe reproduces the reviewed file content and checks; generated image
configurations and filesystem timestamps can produce a different image digest.
A rebuild needs its own qualification and operator review. It is not permission
to reuse the historical deployment approval. Keep all generated manifests,
inventories, authorization and backup files outside Git.
