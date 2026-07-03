DROP INDEX IF EXISTS idx_timerex_reminders_status_scheduled;

ALTER TABLE timerex_booking_reminders RENAME TO timerex_booking_reminders_old;

CREATE TABLE timerex_booking_reminders (
  id            TEXT PRIMARY KEY,
  booking_id    TEXT NOT NULL REFERENCES timerex_bookings(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('two_days_before','day_before','hours_before')),
  scheduled_at  TEXT NOT NULL,
  sent_at       TEXT,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','failed_permanent','cancelled')),
  retry_count   INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  UNIQUE(booking_id, kind)
);

INSERT INTO timerex_booking_reminders
  (id, booking_id, kind, scheduled_at, sent_at, status, retry_count, last_error, created_at)
SELECT
  id, booking_id, kind, scheduled_at, sent_at, status, retry_count, last_error, created_at
FROM timerex_booking_reminders_old;

DROP TABLE timerex_booking_reminders_old;

CREATE INDEX IF NOT EXISTS idx_timerex_reminders_status_scheduled
  ON timerex_booking_reminders(status, scheduled_at);
