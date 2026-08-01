CREATE TABLE IF NOT EXISTS timerex_webhook_configs (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  line_account_id    TEXT NOT NULL REFERENCES line_accounts(id) ON DELETE CASCADE,
  notify_webhook_url TEXT,
  is_active          INTEGER NOT NULL DEFAULT 1,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'))
);

CREATE TABLE IF NOT EXISTS timerex_bookings (
  id              TEXT PRIMARY KEY,
  config_id       TEXT NOT NULL REFERENCES timerex_webhook_configs(id) ON DELETE CASCADE,
  line_account_id TEXT NOT NULL REFERENCES line_accounts(id) ON DELETE CASCADE,
  friend_id       TEXT REFERENCES friends(id) ON DELETE SET NULL,
  external_id     TEXT NOT NULL,
  event_type      TEXT,
  status          TEXT NOT NULL DEFAULT 'booked' CHECK (status IN ('booked','cancelled','unknown')),
  guest_name      TEXT,
  guest_email     TEXT,
  guest_phone     TEXT,
  starts_at       TEXT,
  ends_at         TEXT,
  meet_url        TEXT,
  matched_by      TEXT,
  raw_payload     TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  UNIQUE(config_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_timerex_bookings_account_status_starts
  ON timerex_bookings(line_account_id, status, starts_at);
CREATE INDEX IF NOT EXISTS idx_timerex_bookings_friend_starts
  ON timerex_bookings(friend_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_timerex_bookings_guest_email
  ON timerex_bookings(guest_email);

CREATE TABLE IF NOT EXISTS timerex_booking_reminders (
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

CREATE INDEX IF NOT EXISTS idx_timerex_reminders_status_scheduled
  ON timerex_booking_reminders(status, scheduled_at);

