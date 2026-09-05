import fs from 'node:fs/promises';
import crypto from 'node:crypto';
const root='outputs/clinic-site-release-20260905';
const items=JSON.parse(await fs.readFile(`${root}/catalog-before.json`,'utf8'));
const excluded=items.filter(s=>s.price<=0 || /Тестовые|Груминг/i.test(`${s.category} ${s.title}`) || ['Предоплата','Ночная смена','Зоотакси'].includes(s.title));
const excludedIds=new Set(excluded.map(s=>s.id));
const selected=items.filter(s=>!excludedIds.has(s.id));
if(selected.length!==272 || selected.some(s=>!/^[-a-f0-9]{36}$/.test(s.id)||s.price<=0||s.title.length>240))throw Error('Selection differs from reviewed catalog');
await fs.writeFile(`${root}/selection.json`,JSON.stringify({decision:'All active clinical services except internal/test and zero prices. User approved 2026-09-05.',selected,excluded},null,2));
const sql=`BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TEMP TABLE selected_site_services (id TEXT PRIMARY KEY) ON COMMIT DROP;
INSERT INTO selected_site_services (id) VALUES ${selected.map(s=>`('${s.id}')`).join(',')};
DO $$ BEGIN
 IF (SELECT count(*) FROM "Service" s JOIN selected_site_services p ON p.id=s.id WHERE s."isActive" AND s.price>0) <> 272 THEN RAISE EXCEPTION 'Reviewed services changed; stop and review'; END IF;
END $$;
CREATE TEMP TABLE service_prices_before ON COMMIT DROP AS SELECT id,price,"priceType","minimumPrice","maximumPrice" FROM "Service";
UPDATE "Service" SET "publicOnWebsite"=true,"updatedAt"=CURRENT_TIMESTAMP WHERE id IN (SELECT id FROM selected_site_services);
DO $$ BEGIN
 IF EXISTS (SELECT id,price,"priceType","minimumPrice","maximumPrice" FROM "Service" EXCEPT SELECT * FROM service_prices_before) THEN RAISE EXCEPTION 'Price data changed unexpectedly'; END IF;
END $$;
SELECT count(*) AS public_service_count FROM "Service" WHERE "isActive" AND "publicOnWebsite" AND price>0;
COMMIT;
`;
await fs.writeFile(`${root}/publish-services.sql`,sql);
console.log({selected:selected.length,excluded:excluded.length,sqlSha256:crypto.createHash('sha256').update(sql).digest('hex')});
