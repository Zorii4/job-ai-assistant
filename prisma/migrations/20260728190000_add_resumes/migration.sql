-- CreateEnum
CREATE TYPE "ResumeSourceType" AS ENUM ('TEXT', 'FILE');

-- CreateEnum
CREATE TYPE "SanitizationStatus" AS ENUM ('PENDING_REVIEW', 'CONFIRMED');

-- CreateTable
CREATE TABLE "resume" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceType" "ResumeSourceType" NOT NULL,
    "slot" INTEGER NOT NULL,
    "sourceFileName" TEXT,
    "sourceText" TEXT NOT NULL,
    "sanitizedText" TEXT NOT NULL,
    "sanitizationStatus" "SanitizationStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "sanitizationVersion" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resume_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "resume_userId_updatedAt_idx" ON "resume"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "resume_userId_slot_key" ON "resume"("userId", "slot");

-- AddForeignKey
ALTER TABLE "resume" ADD CONSTRAINT "resume_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
