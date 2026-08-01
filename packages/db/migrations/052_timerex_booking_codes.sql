ALTER TABLE timerex_bookings ADD COLUMN booking_code TEXT;

CREATE TABLE IF NOT EXISTS timerex_booking_codes (
  id              TEXT PRIMARY KEY,
  line_account_id TEXT NOT NULL REFERENCES line_accounts(id) ON DELETE CASCADE,
  friend_id       TEXT NOT NULL REFERENCES friends(id) ON DELETE CASCADE,
  code            TEXT NOT NULL,
  last_booking_id TEXT REFERENCES timerex_bookings(id) ON DELETE SET NULL,
  last_used_at    TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  UNIQUE(line_account_id, friend_id),
  UNIQUE(line_account_id, code)
);

CREATE INDEX IF NOT EXISTS idx_timerex_booking_codes_friend
  ON timerex_booking_codes(friend_id);
