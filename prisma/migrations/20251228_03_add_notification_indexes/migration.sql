-- Add performance indexes for notification queries

-- Index for unread badge queries: (user, read_at) for fast unread detection
-- Used by hasUnread() and countUnread() - O(1) for badge/dot UI
CREATE INDEX "notification_logs_external_user_id_read_at_idx" 
ON "notification_logs"("external_user_id", "read_at");

-- Drop old visible_at index and recreate with DESC sort for listing queries
DROP INDEX IF EXISTS "notification_logs_external_user_id_visible_at_idx";
CREATE INDEX "notification_logs_external_user_id_visible_at_desc_idx" 
ON "notification_logs"("external_user_id", "visible_at" DESC);
