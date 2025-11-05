/*
  Warnings:

  - You are about to drop the `WorkOrder` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "WorkOrder";

-- CreateTable
CREATE TABLE "workOrder" (
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

    CONSTRAINT "workOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workOrder_code_key" ON "workOrder"("code");

-- CreateIndex
CREATE INDEX "workOrder_status_location_createdAt_idx" ON "workOrder"("status", "location", "createdAt");

-- CreateIndex
CREATE INDEX "workOrder_code_idx" ON "workOrder"("code");
