/*
  Warnings:

  - You are about to drop the `workOrder` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "workOrder";

-- CreateTable
CREATE TABLE "WorkOrder" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "reviewPaid" BOOLEAN NOT NULL DEFAULT false,
    "status" "WorkStatus" NOT NULL DEFAULT 'RECEIVED',
    "location" "WorkLocation" NOT NULL DEFAULT 'LOCAL',
    "quote" DECIMAL(65,30),
    "total" DECIMAL(65,30),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_code_key" ON "WorkOrder"("code");

-- CreateIndex
CREATE INDEX "WorkOrder_status_location_createdAt_idx" ON "WorkOrder"("status", "location", "createdAt");

-- CreateIndex
CREATE INDEX "WorkOrder_code_idx" ON "WorkOrder"("code");
