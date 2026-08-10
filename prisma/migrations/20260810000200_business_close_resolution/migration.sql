-- An approved daily close is the director's confirmation of its linked
-- unrecorded-revenue entries. Repair only the review metadata; amounts,
-- categories, cashboxes and close totals remain unchanged.
WITH "candidates" AS MATERIALIZED (
  SELECT
    entry."id" AS "entryId",
    close."id" AS "closeId",
    close."approvedById" AS "actorId",
    COALESCE(close."approvedAt", CURRENT_TIMESTAMP) AS "resolvedAt"
  FROM "BusinessEntry" entry
  INNER JOIN "BusinessDailyClose" close ON close."id" = entry."dailyCloseId"
  WHERE entry."status" = 'ACTIVE'
    AND entry."requiresResolution" = true
    AND close."status" = 'APPROVED'
),
"audit_insert" AS (
  INSERT INTO "AuditLog" ("id", "actorId", "action", "entityType", "entityId", "metadata", "createdAt")
  SELECT
    gen_random_uuid()::text,
    "actorId",
    'business.entry.resolve.daily_close.backfill',
    'BusinessDailyClose',
    "closeId",
    jsonb_build_object(
      'resolvedCount', count(*),
      'reason', 'Подтверждено ранее утверждённым закрытием дня',
      'approvedAt', max("resolvedAt")
    ),
    CURRENT_TIMESTAMP
  FROM "candidates"
  GROUP BY "closeId", "actorId"
  RETURNING "id"
)
UPDATE "BusinessEntry" entry
SET
  "requiresResolution" = false,
  "resolvedAt" = candidates."resolvedAt",
  "resolvedById" = candidates."actorId",
  "resolutionNote" = 'Подтверждено при утверждении закрытия дня',
  "updatedAt" = CURRENT_TIMESTAMP
FROM "candidates"
WHERE entry."id" = candidates."entryId";
