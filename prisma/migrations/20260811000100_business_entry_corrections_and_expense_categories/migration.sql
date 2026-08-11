-- Additive financial audit link: the original operation remains in history,
-- while a corrected operation points back to it.
ALTER TABLE "BusinessEntry" ADD COLUMN "correctionOfId" TEXT;

CREATE INDEX "BusinessEntry_correctionOfId_idx" ON "BusinessEntry"("correctionOfId");

ALTER TABLE "BusinessEntry"
  ADD CONSTRAINT "BusinessEntry_correctionOfId_fkey"
  FOREIGN KEY ("correctionOfId") REFERENCES "BusinessEntry"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Standard selectable expense categories for daily close. Existing categories
-- and historical operations are not rewritten.
INSERT INTO "BusinessCategory" (
  "id", "code", "title", "type", "groupCode", "affectsProfit",
  "administratorAllowed", "isActive", "sortOrder", "createdAt", "updatedAt"
) VALUES
  ('55555555-5555-4555-8555-000000000114', 'daily_salary', 'Зарплата, выданная за день', 'EXPENSE', 'PAYROLL', true, true, true, 111, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('55555555-5555-4555-8555-000000000115', 'laboratory_reagents', 'Лабораторные реагенты', 'EXPENSE', 'OPERATING', true, true, true, 112, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('55555555-5555-4555-8555-000000000116', 'procedure_payout', 'Выплаты за процедуры', 'EXPENSE', 'OPERATING', true, true, true, 113, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('55555555-5555-4555-8555-000000000117', 'ultrasound_payout', 'Выплаты за УЗИ', 'EXPENSE', 'OPERATING', true, true, true, 114, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('55555555-5555-4555-8555-000000000118', 'xray_payout', 'Выплаты за рентген', 'EXPENSE', 'OPERATING', true, true, true, 115, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
