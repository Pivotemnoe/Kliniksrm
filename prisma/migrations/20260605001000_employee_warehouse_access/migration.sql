CREATE TABLE "EmployeeWarehouseAccess" (
  "employeeId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EmployeeWarehouseAccess_pkey" PRIMARY KEY ("employeeId", "warehouseId")
);

CREATE INDEX "EmployeeWarehouseAccess_warehouseId_idx" ON "EmployeeWarehouseAccess"("warehouseId");

ALTER TABLE "EmployeeWarehouseAccess"
  ADD CONSTRAINT "EmployeeWarehouseAccess_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmployeeWarehouseAccess"
  ADD CONSTRAINT "EmployeeWarehouseAccess_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
