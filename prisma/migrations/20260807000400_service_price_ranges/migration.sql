ALTER TABLE "Service"
ADD COLUMN "minimumPrice" DECIMAL(12, 2),
ADD COLUMN "maximumPrice" DECIMAL(12, 2);

-- Older floating services had only one numeric field. Preserve that value as
-- an exact range when it is meaningful; zero-price legacy imports stay unset
-- until a user confirms their real boundaries in the catalog.
UPDATE "Service"
SET "minimumPrice" = "price",
    "maximumPrice" = "price"
WHERE "priceType" = 'FLOATING'
  AND "price" > 0;

ALTER TABLE "Service"
ADD CONSTRAINT "Service_price_range_check"
CHECK (
  ("minimumPrice" IS NULL AND "maximumPrice" IS NULL)
  OR (
    "minimumPrice" IS NOT NULL
    AND "maximumPrice" IS NOT NULL
    AND "minimumPrice" >= 0
    AND "maximumPrice" >= "minimumPrice"
  )
);
