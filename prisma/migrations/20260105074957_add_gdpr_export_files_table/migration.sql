-- CreateTable
CREATE TABLE "gdpr_export_files" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "storage_type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "gdpr_export_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gdpr_export_files_storage_key_key" ON "gdpr_export_files"("storage_key");

-- CreateIndex
CREATE INDEX "gdpr_export_files_expires_at_idx" ON "gdpr_export_files"("expires_at");

-- CreateIndex
CREATE INDEX "gdpr_export_files_deleted_at_idx" ON "gdpr_export_files"("deleted_at");
