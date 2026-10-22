# Public grooming website

The public static client is served at https://pet.temichevvet.ru/ on RU
193.188.23.65. NL is SSH transit only. The clinic API, CRM Web and owner gateway
images are not rebuilt by this website deployment.

- Current static release: `grooming-site-20261022-jtbd-r2`, source
  `d3deddff3771cc097dc627e9fed96bd3ebaa0b58`.
- Previous release retained for rollback: `booking-attribution-grooming-20261022-r1`, source
  `f88aba9451bddfb0d3cfe52cdaa31bd48ae31e41`.
- Both public visual revisions were explicitly approved by the owner on 22 October.
  See `docs/releases/public-sites-jtbd-20261022.md` for exact manifests, verification,
  attribution/cache preservation and the required hotel-then-grooming rollback order.
- Root: `/var/www/temichevvet-grooming/current`.
- Vhost: `/etc/nginx/sites-available/pet.temichevvet.ru`.
- Nginx backup and release receipts:
  `/var/backups/temichevvet-grooming/grooming-site-20261020-r1`.
- Static price-update receipt:
  `/var/backups/temichevvet-grooming/grooming-site-20261020-prices-r2`.
- `release.py` scopes staging, HTTPS verification and rollback to this hostname.
  Stage is intentionally one-shot. Inspect its receipt before repeating a run.
- Subsequent static updates use `update-static.py`. It validates the archive and
  its file manifest, requires the expected prior release, backs up the pointer,
  preserves old hashed entry assets and atomically switches `current`. It does
  not edit Nginx, certificates, gateway settings or containers. Its `rollback`
  mode refuses to overwrite a later release. Keep each previous release on disk.
- The existing Certbot timer renews the certificate. The deploy hook
  `/etc/letsencrypt/renewal-hooks/deploy/40-pet-temichevvet-nginx` validates and
  reloads Nginx only when this hostname's certificate is renewed.

Only three public grooming endpoints proxy to the existing gateway on loopback
port 4100. All other gateway paths remain unavailable on the site hostname.
The selected references and notes use a short-lived opaque draft, followed by
the existing owner cabinet at https://cabinet.temichevvet.ru/portal/grooming.

## Required existing gateway configuration

Both allowlists are required. The general CORS middleware runs before the
grooming-specific origin check:

```dotenv
OWNER_GATEWAY_PUBLIC_SITE_ORIGINS=https://clinic.temichevvet.ru,https://pet.temichevvet.ru
GROOMING_SITE_ORIGINS=https://pet.temichevvet.ru
```

Preserve any additional approved origins when updating these lists.
`fix-gateway-origin.py` adds only the missing public grooming origin and
recreates only `gateway` with the same image. It checks all other environment
values and protects the PostgreSQL and backup containers. It performs no
migration and refuses to overwrite a later deployment during rollback.

Origin-fix backup/receipt:
`/opt/temichevvet-owner-gateway/backups/grooming-site-origin-20261020-r1`.
Its original gateway image is
`sha256:218a56904941ae692ae8f8dbe81bb1d4baab78d7361e72ceda651ec8337b21d8`.
The source script contains no secret values; server `.env` backups remain private.

## Acceptance boundary

The live catalogue, comparison, local saved references/notes and transfer into
the owner login were verified. A real appointment requires genuine services,
prices, workplaces and groomer shifts, which the owner chose to enter in CRM.
Self-booking remains disabled until that setup is complete. This deployment
does not assert that a new appointment or MAX reminder was sent.

The published price section contains 65 dog breed/weight categories, cat care
and 15 additional procedures. It uses the owner's clear handwritten corrections
and the confirmed +300 RUB increase on every monetary amount, including both
range bounds, hourly rates and supplements. The 30% supplement stays a percentage.
Illegible or covered source prices remain quotes before booking. The source
photographs and their private provenance are not part of the public package.

Evidence is saved in the shared workspace under
`output/deployments/grooming-site-20261020-r1/` and
`output/grooming-prices-20261020/`. Local build/cache cleanup has a
separate receipt under `output/maintenance/crm-cache-cleanup-20261020/`.
