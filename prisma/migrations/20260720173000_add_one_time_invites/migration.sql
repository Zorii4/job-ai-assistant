-- CreateTable
CREATE TABLE "invite" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "email" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invite_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "user" ADD COLUMN "inviteId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "invite_codeHash_key" ON "invite"("codeHash");
CREATE INDEX "invite_email_idx" ON "invite"("email");
CREATE INDEX "invite_expiresAt_idx" ON "invite"("expiresAt");
CREATE UNIQUE INDEX "user_inviteId_key" ON "user"("inviteId");

-- AddForeignKey
ALTER TABLE "user"
ADD CONSTRAINT "user_inviteId_fkey"
FOREIGN KEY ("inviteId") REFERENCES "invite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
