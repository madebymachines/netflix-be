/*
  Warnings:

  - You are about to drop the column `isEmailVerified` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `User` table. All the data in the column will be lost.
  - Added the required column `fullName` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "isEmailVerified",
DROP COLUMN "name",
ADD COLUMN     "country" TEXT,
ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "fullName" TEXT NOT NULL,
ADD COLUMN     "isPurchaseVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "profilePictureUrl" TEXT;

-- CreateTable
CREATE TABLE "PurchaseVerification" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "receiptImageUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "rejectionReason" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "PurchaseVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityHistory" (
    "id" BIGSERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "pointsChange" DECIMAL(10,3) NOT NULL,
    "repsChange" INTEGER NOT NULL,
    "pointsFrom" DECIMAL(15,3) NOT NULL,
    "pointsTo" DECIMAL(15,3) NOT NULL,
    "repsFrom" BIGINT NOT NULL,
    "repsTo" BIGINT NOT NULL,
    "caloriesBurned" DECIMAL(10,3),
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserStats" (
    "userId" INTEGER NOT NULL,
    "totalPoints" DECIMAL(15,3) NOT NULL DEFAULT 0,
    "totalReps" BIGINT NOT NULL DEFAULT 0,
    "totalChallenges" INTEGER NOT NULL DEFAULT 0,
    "totalCaloriesBurned" DECIMAL(15,3) NOT NULL DEFAULT 0,
    "weeklyPoints" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "topStreak" INTEGER NOT NULL DEFAULT 0,
    "lastActivityDate" DATE,
    "lastUpdated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserStats_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "PurchaseVerification" ADD CONSTRAINT "PurchaseVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityHistory" ADD CONSTRAINT "ActivityHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStats" ADD CONSTRAINT "UserStats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
