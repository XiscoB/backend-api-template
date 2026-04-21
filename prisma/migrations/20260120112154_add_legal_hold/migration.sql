-- CreateTable
CREATE TABLE "legal_holds" (
    "id" UUID NOT NULL,
    "identity_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "legal_basis" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_holds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "legal_holds_identity_id_idx" ON "legal_holds"("identity_id");

-- CreateIndex
CREATE INDEX "legal_holds_expires_at_idx" ON "legal_holds"("expires_at");

-- AddForeignKey
ALTER TABLE "legal_holds" ADD CONSTRAINT "legal_holds_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "identities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
