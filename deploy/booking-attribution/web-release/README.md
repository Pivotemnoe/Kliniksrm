# Booking source Web release

This packet adds the Avito source link to grooming and pet-hotel reservation
details. The Web payload is frozen at `7e4f6b0e946b2266147adcc429eb4ecc50f8ab50`.
The public-site visual redesign is outside this release.

## Preparation

Build `apps/web`, then run `node deploy/booking-attribution/web-release/package.mjs`.
The packager refuses source drift in `apps/web`, existing output and symlinks.
Transfer the checksummed archive to TECNO and run `prepare-web.ps1` against the
existing installation. It builds from the exact current Web image and checks
every payload file over HTTP, with MIME and SHA-256, both on an empty assets
volume and on an isolated copy of the actual retained assets volume. Existing
asset hashes must remain unchanged. Only the labelled QA containers and volumes
are removed. The live volume and all six production container identities are
preserved.

The Windows preparation on 2026-10-22 qualified 169 new files on each volume and
preserved 6062 old asset hashes. Candidate image:
`sha256:b2f578425912ca912ec3e7170df1912fe83feff052238bbac47ef28030ce549d`.
Base image:
`sha256:12d225af8448dc1794052bd429c13d1b8733f1b0b7e5f4e5938dcd958960f185`.
Private receipts and the assets backup remain on the deployment host.

## Coordinated application and rollback

The API producer owns the two nullable JSONB columns, the single migration,
database backup and isolated restore verification. Seal the packet's exact
coordinated API image identity before running this publisher. Publish the API
first, then inspect and apply Web. `release-web.ps1` defaults to `Inspect`;
`Apply` and `Rollback` require `-Execute`. Only the `web` Compose service may be
recreated. API, Postgres, Redis, MinIO and backup container identities are guarded.

Keep the original qualified manifest (`web-manifest-qualified.json`) matching
the preparation receipt. Publisher-only amendments may add new immutable script
names and seal the image identities; their Web/Dockerfile hash list must still
equal the original qualified payload. Do not overwrite an earlier script or
receipt. The staged operational publisher revision is recorded in the amended
manifest; invoke that exact file rather than an obsolete script.

On rollback, restore Web **before** rolling back the API. Web restores only its
prior image and the configuration backed up after API publication. Configuration,
Compose and rollback-image drift are refused. Retained hashed assets remain
available to both old and new open tabs. The API's compatible rollback preserves
new columns and reservation data; a database dump is never restored as part of
this Web release.

## Publisher failure verification

Run `tests/recovery-io.ps1 -Publisher <absolute publisher path>` in native Windows
PowerShell. It extracts the actual publisher functions and guarded journal write
from the AST and tests only disposable files: exact configuration/BOM recovery
after journal failure, atomic journal readback, refusal to overwrite a journal,
and refusal of rollback after Compose drift. The four checks passed on Windows
PowerShell 5.1 for source SHA-256
`a12fc742d8d1be07ca1c383396cfd7d1bbd680369241c8ec0640dbd1042d2894`.
The test makes no Docker, network or production-data calls.
