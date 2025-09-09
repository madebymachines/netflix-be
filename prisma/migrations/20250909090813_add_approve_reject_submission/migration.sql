-- AlterTable
ALTER TABLE "ActivityHistory" ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "status" "PurchaseStatus" NOT NULL DEFAULT 'PENDING';
