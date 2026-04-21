/*
  Warnings:

  - You are about to drop the `legal_holds` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "legal_holds" DROP CONSTRAINT "legal_holds_identity_id_fkey";

-- DropTable
DROP TABLE "legal_holds";

-- CreateTable
CREATE TABLE "deletion_legal_holds" (
    "id" UUID NOT NULL,
    "identity_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "legal_basis" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deletion_legal_holds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deletion_legal_holds_identity_id_idx" ON "deletion_legal_holds"("identity_id");

-- CreateIndex
CREATE INDEX "deletion_legal_holds_expires_at_idx" ON "deletion_legal_holds"("expires_at");

-- AddForeignKey
ALTER TABLE "deletion_legal_holds" ADD CONSTRAINT "deletion_legal_holds_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "identities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
