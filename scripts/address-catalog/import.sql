\set ON_ERROR_STOP on
-- Session lock serializes scheduled/manual refreshes without locking clinical tables.
SELECT pg_advisory_lock(29092623);
DROP TABLE IF EXISTS "AddressCatalogEntry_next";
CREATE TABLE "AddressCatalogEntry_next" (LIKE "AddressCatalogEntry" INCLUDING DEFAULTS INCLUDING GENERATED INCLUDING CONSTRAINTS);
\copy "AddressCatalogEntry_next" ("id", "region", "level", "label", "priority", "sourceVersion", "searchText", "name", "localityNames") FROM '/tmp/crm-addresses.tsv' WITH (FORMAT csv, DELIMITER E'\t');
DO $$ BEGIN
  IF (SELECT count(*) FROM "AddressCatalogEntry_next" WHERE region = 23) < 10000
    OR (SELECT count(*) FROM "AddressCatalogEntry_next" WHERE region = 26) < 10000
    OR EXISTS (SELECT 1 FROM "AddressCatalogEntry_next" WHERE region NOT IN (23,26))
    OR (SELECT count(DISTINCT "sourceVersion") FROM "AddressCatalogEntry_next") <> 1
    OR (SELECT min("sourceVersion") FROM "AddressCatalogEntry_next") < COALESCE((SELECT max("sourceVersion") FROM "AddressCatalogEntry"),0)
  THEN RAISE EXCEPTION 'Incomplete or older address snapshot'; END IF;
END $$;
ALTER TABLE "AddressCatalogEntry_next" ADD CONSTRAINT "AddressCatalogEntry_next_pkey" PRIMARY KEY (id);
CREATE INDEX "AddressCatalogEntry_next_search_idx" ON "AddressCatalogEntry_next" USING GIN ("searchVector");
CREATE INDEX "AddressCatalogEntry_next_priority_idx" ON "AddressCatalogEntry_next" ("priority", "level");
ANALYZE "AddressCatalogEntry_next";
BEGIN;
SET LOCAL lock_timeout = '5s';
DROP TABLE IF EXISTS "AddressCatalogEntry_previous";
ALTER TABLE "AddressCatalogEntry" RENAME TO "AddressCatalogEntry_previous";
ALTER INDEX "AddressCatalogEntry_pkey" RENAME TO "AddressCatalogEntry_previous_pkey";
ALTER INDEX "AddressCatalogEntry_search_idx" RENAME TO "AddressCatalogEntry_previous_search_idx";
ALTER INDEX "AddressCatalogEntry_priority_idx" RENAME TO "AddressCatalogEntry_previous_priority_idx";
ALTER TABLE "AddressCatalogEntry_next" RENAME TO "AddressCatalogEntry";
ALTER INDEX "AddressCatalogEntry_next_pkey" RENAME TO "AddressCatalogEntry_pkey";
ALTER INDEX "AddressCatalogEntry_next_search_idx" RENAME TO "AddressCatalogEntry_search_idx";
ALTER INDEX "AddressCatalogEntry_next_priority_idx" RENAME TO "AddressCatalogEntry_priority_idx";
COMMIT;
SELECT pg_advisory_unlock(29092623);
SELECT region,count(*),min("sourceVersion"),max("sourceVersion") FROM "AddressCatalogEntry" GROUP BY region;
SELECT pg_size_pretty(pg_total_relation_size('"AddressCatalogEntry"')) AS catalog_size;
