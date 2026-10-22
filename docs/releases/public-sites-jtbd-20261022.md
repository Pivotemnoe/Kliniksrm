# Public grooming and hotel visual release — 22 October 2026

The owner reviewed the internal versions, requested restoration of the hotel
headline «Вы — в поездке. Он — у нас.», and explicitly approved publication:
«Хорошо, делай публикацию», followed by «Зоу гостиницу и громен салон, всю публику».
The scope is both static websites, including reviewed copy, photography and
favicons. It does not include clinical configuration, services or notifications.

Approved visual source: `d6a5cc8c6c9eff9b448949d1bf6b7fbfba1e4aa8`.
Built source: `d3deddff3771cc097dc627e9fed96bd3ebaa0b58` (the only subsequent
changes record approval and accept the existing attributed grooming predecessor
in the standalone publisher). Grooming HTML, entry JS and CSS match the reviewed
internal build byte for byte. Both packages declare clean source and no fixtures.

| Site | Current release | release.json SHA-256 | Files |
| --- | --- | --- | --- |
| https://pet.temichevvet.ru/ | grooming-site-20261022-jtbd-r2 | 10e559cb8372be0177a8bce43986f0c88c1e049eed7ed156df64931a7c4dee64 | 131 |
| https://pet.temichevvet.ru/pet-hotel/ | pet-hotel-site-20261022-jtbd-r3 | 3637af68fb059b8d02f92f580e733b453cdd52f3facb930c398f39f79fec68da | 33 |

Grooming current: `/var/www/temichevvet-grooming/releases/grooming-site-20261022-jtbd-r2`.
Hotel current: `/var/www/temichevvet-pet-hotel/releases/pet-hotel-site-20261022-jtbd-r3`.

Archives, retained privately at `/root/public-sites-jtbd-20261022-r2/`:

- Grooming archive SHA-256: `b5b6566e6799e7fe8b9f15d0302aecd0aaa9e2faa7b173023ef168016dac9fef`.
- Hotel archive SHA-256: `b5f1bb0fe8d82cd95b83780c76f15988c0c0c0e14d3fd50dc6bd8f4d5b47cb67`.

## Verification and preserved state

Both publishers returned PUBLISHED. External HTTPS verification passed for all
164 files, checking status, exact content hash and MIME type. Both homepages were
also rendered in the in-app browser. Seventeen existing attribution/release/
publisher tests passed before deployment. The grooming predecessor parser still
rejects traversal and identifiers for another module.

All previous public file paths remain available. All previous image/font assets
retain their original bytes; nine previous grooming entry JS/CSS files are
included in the new manifest. The hotel keeps
`booking-attribution-v1-49c2550b9f22a96d.js`; its bytes and the new
`booking-attribution.js` are identical, SHA-256
`49c2550b9f22a96d80658ab408b6aedfd7ee02eb2b9ab296375e2c966897059d`.
The validated URL/session attribution contract remains in both active clients.

Read-only host verification at 11:01:22 UTC / 14:01 Moscow confirmed unchanged
Nginx bytes (SHA-256 `32bfb4e107cd45ce3f992fc2c259923e69f6661f70f1b984d344c77b2e57ca9b`)
and all application container identities. No backend image, database, settings,
MAX transport, service or price configuration was changed. No booking or message
was created. Gateway remains `sha256:f4dd426ed634ccfc31357620faaed8b76f54a6e902c2b1b646de6f56943ceda3`.

At verification, the hotel catalogue was fresh with 12 rooms and self-booking
enabled. The grooming storefront was fresh with 172 services, 0 public eligible
specialists and self-booking disabled; the site offers the clinic phone for
booking. Both owner portal pages returned HTTP 200. Publication does not close
the separate real-booking/notification acceptance work.

## Guarded recovery

Both predecessor directories remain byte-identical to the pre-release snapshot:

- Hotel: `/var/www/temichevvet-pet-hotel/releases/booking-attribution-pet-hotel-20261022-r1`.
- Grooming: `/var/www/temichevvet-grooming/releases/booking-attribution-grooming-20261022-r1`.

Read-only verification confirmed rollback prerequisites. Rollback was not run.
If these releases are still current, execute on RU in this order:

```sh
python3 /root/public-sites-jtbd-20261022-r2/publish.py rollback --release pet-hotel-site-20261022-jtbd-r3
python3 /root/public-sites-jtbd-20261022-r2/update-static.py rollback --release grooming-site-20261022-jtbd-r2
```

Hotel recovery comes first because its protected grooming snapshot is the new
grooming release. After both standalone recoveries, the frozen coordinated
attribution publisher can see its exact original static predecessors again.
Do not edit or weaken its frozen guards. Later releases/configuration drift
require a new review instead of overwriting them.

Private server receipts are under:

- `/var/backups/temichevvet-grooming/grooming-site-20261022-jtbd-r2/`.
- `/var/backups/temichevvet-pet-hotel/pet-hotel-site-20261022-jtbd-r3/`.

Local evidence: `output/deployments/public-sites-jtbd-20261022-r2/`, especially
`before.json`, `prepared.json`, `stage.json`, `grooming-published.json`,
`hotel-prepared.json`, `hotel-published.json`, `external-https.json`,
`host-after.json` and `screenshots/`. The earlier internal PDF and immutable
internal-r1 package remain preserved.
