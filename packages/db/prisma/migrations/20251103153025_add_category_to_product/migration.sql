-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "category" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "Product_category_idx" ON "Product"("category");
