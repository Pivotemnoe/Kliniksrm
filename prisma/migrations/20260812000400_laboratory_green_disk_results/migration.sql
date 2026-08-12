-- Turn the imported one-line "16 indicators" placeholder into a real result grid.
-- Historical order rows stay unchanged; only future orders use the structured profile.
INSERT INTO "LaboratoryTest" (
  "id", "title", "code", "groupName", "material", "unit", "referenceRange", "species", "isActive", "createdAt", "updatedAt"
)
VALUES
  ('7b8a6101-7b61-4c20-9101-000000000001', 'Альбумин', 'ALB', 'Биохимия', 'Кровь', 'g/L', 'Кошка: 22.0–44.0; собака: 25.0–44.0', ARRAY['Кошка','Собака'], true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('7b8a6101-7b61-4c20-9101-000000000002', 'Белок общий', 'TP', 'Биохимия', 'Кровь', 'g/L', 'Кошка: 57.0–89.0; собака: 54–77', ARRAY['Кошка','Собака'], true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('7b8a6101-7b61-4c20-9101-000000000003', 'Глобулин', 'GLOB', 'Биохимия', 'Кровь', 'g/L', 'Кошка: 23–52; собака: 19–45', ARRAY['Кошка','Собака'], true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('7b8a6101-7b61-4c20-9101-000000000004', 'Альбумин/глобулин', 'A/G', 'Биохимия', 'Кровь', NULL, NULL, ARRAY['Кошка','Собака'], true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('7b8a6101-7b61-4c20-9101-000000000005', 'Общий билирубин', 'TB', 'Биохимия', 'Кровь', 'umol/L', 'Кошка: 0.0–15.0; собака: 0.0–15.0', ARRAY['Кошка','Собака'], true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('7b8a6101-7b61-4c20-9101-000000000006', 'Аспартатаминотрансфераза', 'AST', 'Биохимия', 'Кровь', 'U/L', 'Кошка: 0–48', ARRAY['Кошка','Собака'], true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('7b8a6101-7b61-4c20-9101-000000000007', 'Аланин-аминотрансфераза', 'ALT', 'Биохимия', 'Кровь', 'U/L', 'Кошка: 5–130', ARRAY['Кошка','Собака'], true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('7b8a6101-7b61-4c20-9101-000000000008', 'Амилаза', 'AMY', 'Биохимия', 'Кровь', 'U/L', 'Кошка: 500–1500', ARRAY['Кошка','Собака'], true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('7b8a6101-7b61-4c20-9101-000000000009', 'Креатинкиназа', 'CK', 'Биохимия', 'Кровь', 'U/L', 'Кошка: 0–559', ARRAY['Кошка','Собака'], true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('7b8a6101-7b61-4c20-9101-000000000010', 'Креатинин', 'Crea', 'Биохимия', 'Кровь', 'umol/L', 'Кошка: 44.0–212.0', ARRAY['Кошка','Собака'], true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('7b8a6101-7b61-4c20-9101-000000000011', 'Мочевина', 'BUN', 'Биохимия', 'Кровь', 'mmol/L', 'Кошка: 4.00–12.90', ARRAY['Кошка','Собака'], true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('7b8a6101-7b61-4c20-9101-000000000012', 'Соотношение мочевина/креатинин', 'BUN/CREA', 'Биохимия', 'Кровь', NULL, 'Кошка: 27.000–182.000', ARRAY['Кошка','Собака'], true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('7b8a6101-7b61-4c20-9101-000000000013', 'Глюкоза', 'GLU', 'Биохимия', 'Кровь', 'mmol/L', 'Кошка: 4.11–8.83', ARRAY['Кошка','Собака'], true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('7b8a6101-7b61-4c20-9101-000000000014', 'Тиреоглобулин', 'TG', 'Биохимия', 'Кровь', 'mmol/L', 'Кошка: 0.11–1.13', ARRAY['Кошка','Собака'], true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('7b8a6101-7b61-4c20-9101-000000000015', 'Кальций', 'Ca', 'Биохимия', 'Кровь', 'mmol/L', 'Кошка: 1.95–2.83', ARRAY['Кошка','Собака'], true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('7b8a6101-7b61-4c20-9101-000000000016', 'Фосфор', 'PHOS', 'Биохимия', 'Кровь', 'mmol/L', 'Кошка: 1.00–2.42', ARRAY['Кошка','Собака'], true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE SET
  "title" = EXCLUDED."title",
  "code" = EXCLUDED."code",
  "groupName" = EXCLUDED."groupName",
  "material" = EXCLUDED."material",
  "unit" = EXCLUDED."unit",
  "referenceRange" = EXCLUDED."referenceRange",
  "species" = EXCLUDED."species",
  "isActive" = true,
  "updatedAt" = CURRENT_TIMESTAMP;

WITH green_profiles AS (
  SELECT "id"
  FROM "LaboratoryProfile"
  WHERE lower("title") LIKE '%биохим%'
    AND (lower("title") LIKE '%зелен%' OR lower("title") LIKE '%зелён%')
    AND lower("title") LIKE '%16%'
)
DELETE FROM "LaboratoryProfileTest" link
USING green_profiles profile, "LaboratoryTest" test
WHERE link."profileId" = profile."id"
  AND link."testId" = test."id"
  AND test."code" IS NULL
  AND lower(test."title") LIKE '%16 показател%';

WITH green_profiles AS (
  SELECT "id"
  FROM "LaboratoryProfile"
  WHERE lower("title") LIKE '%биохим%'
    AND (lower("title") LIKE '%зелен%' OR lower("title") LIKE '%зелён%')
    AND lower("title") LIKE '%16%'
), structured_tests("id", "sortOrder") AS (
  VALUES
    ('7b8a6101-7b61-4c20-9101-000000000001', 0),
    ('7b8a6101-7b61-4c20-9101-000000000002', 1),
    ('7b8a6101-7b61-4c20-9101-000000000003', 2),
    ('7b8a6101-7b61-4c20-9101-000000000004', 3),
    ('7b8a6101-7b61-4c20-9101-000000000005', 4),
    ('7b8a6101-7b61-4c20-9101-000000000006', 5),
    ('7b8a6101-7b61-4c20-9101-000000000007', 6),
    ('7b8a6101-7b61-4c20-9101-000000000008', 7),
    ('7b8a6101-7b61-4c20-9101-000000000009', 8),
    ('7b8a6101-7b61-4c20-9101-000000000010', 9),
    ('7b8a6101-7b61-4c20-9101-000000000011', 10),
    ('7b8a6101-7b61-4c20-9101-000000000012', 11),
    ('7b8a6101-7b61-4c20-9101-000000000013', 12),
    ('7b8a6101-7b61-4c20-9101-000000000014', 13),
    ('7b8a6101-7b61-4c20-9101-000000000015', 14),
    ('7b8a6101-7b61-4c20-9101-000000000016', 15)
)
INSERT INTO "LaboratoryProfileTest" ("profileId", "testId", "sortOrder", "createdAt")
SELECT profile."id", test."id", test."sortOrder", CURRENT_TIMESTAMP
FROM green_profiles profile
CROSS JOIN structured_tests test
ON CONFLICT ("profileId", "testId") DO UPDATE SET "sortOrder" = EXCLUDED."sortOrder";

UPDATE "LaboratoryTest" placeholder
SET "isActive" = false, "updatedAt" = CURRENT_TIMESTAMP
WHERE placeholder."code" IS NULL
  AND lower(placeholder."title") LIKE '%биохим%'
  AND lower(placeholder."title") LIKE '%16 показател%'
  AND (lower(placeholder."title") LIKE '%зелен%' OR lower(placeholder."title") LIKE '%зелён%')
  AND NOT EXISTS (
    SELECT 1 FROM "LaboratoryProfileTest" link WHERE link."testId" = placeholder."id"
  );
