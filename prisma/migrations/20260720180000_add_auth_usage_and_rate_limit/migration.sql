-- CreateEnum
CREATE TYPE "PlanCode" AS ENUM ('ALPHA');

-- AlterTable
ALTER TABLE "user"
ADD COLUMN "planCode" "PlanCode" NOT NULL DEFAULT 'ALPHA';

-- CreateTable
CREATE TABLE "rateLimit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "lastRequest" BIGINT NOT NULL,

    CONSTRAINT "rateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rateLimit_key_key" ON "rateLimit"("key");
