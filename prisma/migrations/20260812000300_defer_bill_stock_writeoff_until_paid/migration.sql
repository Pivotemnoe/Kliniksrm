-- Earlier versions deducted ordinary bill products as soon as a line was added.
-- Restore only the still-unpaid net deduction. Keep every original movement and
-- add an auditable correction in the same batch. Hospital executions and retail
-- sales keep their independent immediate stock workflow.
CREATE TEMP TABLE "_PrematureBillStockRestore" ON COMMIT DROP AS
SELECT
  sm."billItemId",
  sm."productId",
  sm."stockBatchId",
  sm."warehouseId",
  b."visitId",
  -SUM(sm."quantity") AS "quantity"
FROM "StockMovement" sm
JOIN "BillItem" bi ON bi."id" = sm."billItemId"
JOIN "Bill" b ON b."id" = bi."billId"
LEFT JOIN "HospitalRecord" hr ON hr."billItemId" = bi."id"
WHERE sm."billItemId" IS NOT NULL
  AND sm."stockBatchId" IS NOT NULL
  AND sm."type" IN ('VISIT_USAGE', 'WRITE_OFF', 'CORRECTION')
  AND b."status" IN ('UNPAID', 'PARTIAL', 'REFUNDED', 'CANCELLED')
  AND b."source" <> 'SALE'
  AND hr."id" IS NULL
GROUP BY
  sm."billItemId",
  sm."productId",
  sm."stockBatchId",
  sm."warehouseId",
  b."visitId"
HAVING SUM(sm."quantity") < 0;

UPDATE "StockBatch" batch
SET "rest" = batch."rest" + correction."quantity",
    "updatedAt" = CURRENT_TIMESTAMP
FROM "_PrematureBillStockRestore" correction
WHERE batch."id" = correction."stockBatchId";

INSERT INTO "StockMovement" (
  "id",
  "productId",
  "billItemId",
  "stockBatchId",
  "warehouseId",
  "visitId",
  "type",
  "quantity",
  "comment"
)
SELECT
  gen_random_uuid()::text,
  correction."productId",
  correction."billItemId",
  correction."stockBatchId",
  correction."warehouseId",
  correction."visitId",
  'CORRECTION',
  correction."quantity",
  'Возврат преждевременного списания: товар списывается только после полной оплаты'
FROM "_PrematureBillStockRestore" correction;
