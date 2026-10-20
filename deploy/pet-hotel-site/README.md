# Hotel static publisher

This publishes `https://pet.temichevvet.ru/pet-hotel/` on RU host
`msk-1-vm-d817`. The CRM release owner deploys the shared clinical API, CRM Web
and owner gateway first. This script never builds images, migrates databases,
changes environment files, or restarts containers.

`publish.py` uses only Python's standard library plus the existing `nginx`,
`systemctl`, `curl`, and Docker CLI. Its CLI requires root on the exact RU host;
it has no alternate-host, alternate-root, or skip-gate option. Tests import the
publisher with a temporary filesystem and fake commands/HTTP responses.

## Package and stage

Build a clean committed source with
`prototypes/temichevvet-pet-hotel-20261020/scripts/build-release.mjs`. The archive
must contain exactly the self-contained `pet-hotel/` subtree, including its
`release.json`. Preserve the archive SHA-256 independently during transfer.
Original HEIC files, private previews, screenshots, and rejected photos do not
belong in the archive.

Copy the script and archive to private absolute paths on RU. Inspect the current
vhost and obtain its SHA-256 before calling `prepare` with concrete values:

```sh
python3 /private/path/publish.py prepare \
  --release pet-hotel-site-20261020-REPLACE \
  --archive /private/path/hotel.tar \
  --sha256 ARCHIVE_SHA256 \
  --expected-nginx-sha256 REVIEWED_VHOST_SHA256
```

The uppercase placeholders must be replaced; release identifiers are lowercase.
`prepare` is inactive: it verifies the archive digest, rejects traversal, links,
duplicate paths and unexpected files, and checks every manifest hash. Dirty
builds and fixture packages are rejected. It creates an immutable release in
`/var/www/temichevvet-pet-hotel/releases/<release>/pet-hotel/`, a private backup
and candidate configuration under
`/var/backups/temichevvet-pet-hotel/<release>/`, and a `prepared.json` receipt.
It does not change the active vhost or `current` pointer.

The complete Nginx candidate is checked with a temporary copy of `nginx.conf`
whose `sites-enabled` include points to symlinks for all current vhosts, with
only this one replaced by the candidate. The active global Nginx configuration
is never edited. The existing public `/v1/` and `/internal/` deny boundaries
must be present. Only these routes are added inside the existing TLS server:

- `/pet-hotel` redirects with 308 to `/pet-hotel/`.
- `/pet-hotel/` serves the independent hotel `current` tree; missing files return 404.
- Exact public hotel `catalog` GET, `availability` GET, and `drafts` POST routes
  proxy to the existing loopback gateway on port 4100.

Unmanaged pre-existing hotel routes cause a stop for inspection. Grooming's
root, existing routes, security headers and certificate configuration remain
byte-for-byte outside the added managed block.

## Coordinated activation

After the CRM release owner confirms the production gateway and real room
snapshot, use the **full source SHA of its running image**, not the website SHA:

```sh
python3 /private/path/publish.py activate \
  --release pet-hotel-site-20261020-REPLACE \
  --gateway-revision FULL_GATEWAY_SOURCE_SHA
```

Activation revalidates the staged artifact, candidate configuration and all
predecessor identities. It requires the exact running gateway image revision,
an available hotel owner portal, and a production catalog with `connected`,
`enabled`, `fresh` and `selfBookingEnabled` all true, `testMode` false, a
`capturedAt` within 90 seconds, nonempty active rooms with rates and the correct
owner portal URL. A local or test snapshot cannot open production booking.

The script holds both hotel and grooming static-update locks, rejects concurrent
vhost/grooming/pointer changes, atomically switches the hotel symlink and vhost,
runs `nginx -t`, and reloads only Nginx. It then verifies every hotel file over
public HTTPS against the manifest, the fresh public catalog, API denial
boundaries, the unchanged public grooming index/release and all original
grooming file hashes, unrelated enabled vhosts, and unchanged container IDs.
A five-second readiness window tolerates old bytes while the previous Nginx
workers drain after reload; every file must still converge to its exact expected
hash. A persistent mismatch triggers the same guarded rollback.
A successful run creates `published.json`. No booking or notification is sent
by these publication checks; real booking acceptance is a separate test.

## Recovery

Syntax, reload or HTTPS verification failures trigger a guarded restoration of
the original pointer and vhost, another Nginx check/reload, and a private
`failure.json` receipt. All release files and history stay on disk.

For an explicit rollback after publication or an interrupted activation:

```sh
python3 /private/path/publish.py rollback \
  --release pet-hotel-site-20261020-REPLACE
```

Rollback refuses to overwrite a later hotel pointer or any concurrent vhost
change. The first release restores the original vhost and removes only its
`current` symlink; later releases restore the exact preceding symlink target.
It leaves gateway services and databases as released by the CRM owner.

`prepare` is one-shot per release ID. Activation may be retried if a readiness
gate failed before `activation.json` was written. After activation started,
inspect the receipts and recover explicitly rather than repeating activation
blindly. Keep backups and previous releases until acceptance and retention are
decided separately.

Local verification:

```sh
node --test tests/pet-hotel-site-publisher.test.mjs
```
