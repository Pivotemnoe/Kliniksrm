CREATE TABLE "ConsumableRule" (
  "id" TEXT NOT NULL, "code" TEXT NOT NULL, "title" TEXT NOT NULL, "inputKind" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "ConsumableRule_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ConsumableRule_code_key" ON "ConsumableRule"("code");
CREATE TABLE "ConsumableRuleOption" (
  "id" TEXT NOT NULL, "ruleId" TEXT NOT NULL, "productId" TEXT NOT NULL,
  "minValue" DECIMAL(12,3) NOT NULL, "maxValue" DECIMAL(12,3) NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL DEFAULT 1, CONSTRAINT "ConsumableRuleOption_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConsumableRuleOption_range_check" CHECK ("minValue" >= 0 AND "maxValue" > "minValue" AND "quantity" > 0),
  CONSTRAINT "ConsumableRuleOption_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "ConsumableRule"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ConsumableRuleOption_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ConsumableRuleOption_ruleId_minValue_key" ON "ConsumableRuleOption"("ruleId", "minValue");
CREATE INDEX "ConsumableRuleOption_productId_idx" ON "ConsumableRuleOption"("productId");
CREATE TABLE "ProductConsumableRule" (
  "productId" TEXT NOT NULL, "ruleId" TEXT NOT NULL, CONSTRAINT "ProductConsumableRule_pkey" PRIMARY KEY ("productId", "ruleId"),
  CONSTRAINT "ProductConsumableRule_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProductConsumableRule_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "ConsumableRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ProductConsumableRule_ruleId_idx" ON "ProductConsumableRule"("ruleId");
