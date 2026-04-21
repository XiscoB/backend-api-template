-- CreateTable
CREATE TABLE "scheduler_locks" (
    "job_name" TEXT NOT NULL,
    "locked_by" TEXT NOT NULL,
    "locked_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "last_run_at" TIMESTAMP(3),

    CONSTRAINT "scheduler_locks_pkey" PRIMARY KEY ("job_name")
);
