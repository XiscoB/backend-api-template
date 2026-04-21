-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "reporter_identity_id" UUID NOT NULL,
    "reported_identity_id" UUID,
    "reported_content_id" TEXT,
    "content_type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "details" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "valid" BOOLEAN,
    "resolved_at" TIMESTAMP(3),
    "resolved_by_identity_id" UUID,
    "reported_content_snapshot" JSONB,
    "reported_user_snapshot" JSONB,
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reports_resolved_valid_idx" ON "reports"("resolved", "valid");

-- CreateIndex
CREATE INDEX "reports_created_at_idx" ON "reports"("created_at");

-- CreateIndex
CREATE INDEX "reports_reporter_identity_id_idx" ON "reports"("reporter_identity_id");

-- CreateIndex
CREATE INDEX "reports_reported_identity_id_idx" ON "reports"("reported_identity_id");

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_identity_id_fkey" FOREIGN KEY ("reporter_identity_id") REFERENCES "identities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reported_identity_id_fkey" FOREIGN KEY ("reported_identity_id") REFERENCES "identities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolved_by_identity_id_fkey" FOREIGN KEY ("resolved_by_identity_id") REFERENCES "identities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
