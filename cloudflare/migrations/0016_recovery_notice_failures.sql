ALTER TABLE recovery_notice_outbox ADD COLUMN blocked_at INTEGER;
ALTER TABLE recovery_notice_outbox ADD COLUMN blocked_reason TEXT;
