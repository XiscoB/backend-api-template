-- CreateEnum
CREATE TYPE "internal_log_level" AS ENUM ('INFO', 'WARN', 'ERROR');

-- CreateTable
CREATE TABLE "internal_logs" (
    "id" UUID NOT NULL,
    "level" "internal_log_level" NOT NULL,
    "source" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "context" JSONB,
    "identity_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "internal_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "internal_logs_created_at_idx" ON "internal_logs"("created_at");

-- CreateIndex
CREATE INDEX "internal_logs_level_idx" ON "internal_logs"("level");

-- CreateIndex
CREATE INDEX "internal_logs_source_idx" ON "internal_logs"("source");
