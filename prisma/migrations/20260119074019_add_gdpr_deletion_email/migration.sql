-- CreateTable
CREATE TABLE "gdpr_deletion_emails" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gdpr_deletion_emails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gdpr_deletion_emails_request_id_key" ON "gdpr_deletion_emails"("request_id");
