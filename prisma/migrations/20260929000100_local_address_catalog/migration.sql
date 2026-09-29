CREATE TABLE "AddressCatalogEntry" (
  "id" BIGINT PRIMARY KEY,
  "region" INTEGER NOT NULL,
  "level" INTEGER NOT NULL,
  "label" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "localityNames" TEXT NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "sourceVersion" INTEGER NOT NULL,
  "searchText" TEXT NOT NULL,
  "searchVector" TSVECTOR GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, "searchText")) STORED
);
CREATE INDEX "AddressCatalogEntry_search_idx" ON "AddressCatalogEntry" USING GIN ("searchVector");
CREATE INDEX "AddressCatalogEntry_priority_idx" ON "AddressCatalogEntry" ("priority", "level");
