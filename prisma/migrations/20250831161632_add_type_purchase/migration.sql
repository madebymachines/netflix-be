-- CreateEnum
CREATE TYPE "PurchaseType" AS ENUM ('MEMBER_GYM', 'RECEIPT');

-- AlterTable
ALTER TABLE "PurchaseVerification" ADD COLUMN     "type" "PurchaseType" NOT NULL DEFAULT 'RECEIPT';
