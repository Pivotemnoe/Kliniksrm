# Public grooming website

The public static client is served at https://pet.temichevvet.ru/ on RU
193.188.23.65. NL is SSH transit only. The clinic API, CRM Web and owner gateway
images are not rebuilt by this website deployment.

- Static release: `grooming-site-20261020-r1`, source
  `ef20104bae63e37dffc7f68ba9e2c2bb9043434e`.
- Root: `/var/www/temichevvet-grooming/current`.
- Vhost: `/etc/nginx/sites-available/pet.temichevvet.ru`.
- Nginx backup and release receipts:
  `/var/backups/temichevvet-grooming/grooming-site-20261020-r1`.
- `release.py` scopes staging, HTTPS verification and rollback to this hostname.
  Stage is intentionally one-shot. Inspect its receipt before repeating a run.
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

Evidence is saved in the shared workspace under
`output/deployments/grooming-site-20261020-r1/`. Local build/cache cleanup has a
separate receipt under `output/maintenance/crm-cache-cleanup-20261020/`.
