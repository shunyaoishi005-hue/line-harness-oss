DROP INDEX IF EXISTS idx_timerex_reminders_status_scheduled;

-- Historical fork releases rebuilt this table to add `two_days_before` to
-- the kind constraint. Migration 051 now creates the final constraint
-- directly, so replaying that destructive rebuild is unnecessary and is
-- intentionally avoided by the additive-only update engine.

CREATE INDEX IF NOT EXISTS idx_timerex_reminders_status_scheduled
  ON timerex_booking_reminders(status, scheduled_at);
