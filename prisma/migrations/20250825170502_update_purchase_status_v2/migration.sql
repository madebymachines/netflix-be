/*
  Warnings:

  - The `status` column on the `PurchaseVerification` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `isPurchaseVerified` on the `User` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('NOT_VERIFIED', 'PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "PurchaseVerification" DROP COLUMN "status",
ADD COLUMN     "status" "PurchaseStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "User" DROP COLUMN "isPurchaseVerified",
ADD COLUMN     "purchaseStatus" "PurchaseStatus" NOT NULL DEFAULT 'NOT_VERIFIED';
