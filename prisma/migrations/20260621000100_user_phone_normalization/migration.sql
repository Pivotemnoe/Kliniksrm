ALTER TABLE "User" ADD COLUMN "phoneNormalized" VARCHAR(16);

WITH normalized AS (
  SELECT
    "id",
    CASE
      WHEN length(digits) = 10 THEN '7' || digits
      WHEN length(digits) = 11 AND left(digits, 1) = '8' THEN '7' || substring(digits from 2)
      WHEN length(digits) = 11 AND left(digits, 1) = '7' THEN digits
      ELSE NULL
    END AS phone_key
  FROM (
    SELECT "id", regexp_replace(coalesce("phone", ''), '[^0-9]', '', 'g') AS digits
    FROM "User"
  ) source
)
UPDATE "User" "user"
SET
  "phoneNormalized" = normalized.phone_key,
  "phone" = CASE
    WHEN normalized.phone_key ~ '^7[0-9]{10}$'
      THEN '+7 ' || substring(normalized.phone_key from 2 for 3) || ' ' ||
           substring(normalized.phone_key from 5 for 3) || ' ' ||
           substring(normalized.phone_key from 8 for 2) || ' ' ||
           substring(normalized.phone_key from 10 for 2)
    ELSE "user"."phone"
  END
FROM normalized
WHERE "user"."id" = normalized."id";

CREATE INDEX "User_phoneNormalized_idx" ON "User"("phoneNormalized");
