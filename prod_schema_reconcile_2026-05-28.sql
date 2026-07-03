-- =============================================================================
-- 本番 D1 (line-crm) スキーマ追い付き適用  2026-05-28
-- =============================================================================
-- 目的: 本番 D1 を v0.14.0 が要求する schema.sql + migrations 相当へ追従させる。
-- 本番が ~migration 027 相当で止まっており、028〜040（035 rich_menu と
-- line_accounts.country/role/display_order はユーザーが手動適用済み）が未適用。
--
-- 方針:
--   * 追加のみ (ALTER TABLE ADD COLUMN / CREATE TABLE IF NOT EXISTS /
--     CREATE INDEX IF NOT EXISTS)。DROP / DELETE / カラム削除は一切しない。
--   * 各テーブルは「カラム追加 → インデックス作成」の順で並べる
--     (schema.sql 一括適用が source at offset 88 で落ちた原因の回避)。
--   * データ backfill / seed は含めない（別途 Part B として提示）。
--   * wrangler は --file をトランザクションで実行するため、途中失敗時は
--     全ロールバックされ DB は無傷。
--
-- 既知の制約 (additive では解消不可、別途要相談):
--   * broadcasts.target_type の CHECK は本番では ('all','tag') のまま。
--     ('segment','multi-account-dedup') への拡張は table 再構築 (DROP) が
--     必要なため本スクリプトでは行わない。閲覧系は 500 にならないが、
--     dedup/segment 配信の "作成" は別対応するまで不可。
-- =============================================================================


-- ============================================================
-- 1. messages_log  (migrations 028 / 032 / 038_scenario_templates_and_stats)
--    source 欠落が schema.sql 一括適用エラーの直接原因
-- ============================================================
ALTER TABLE messages_log ADD COLUMN source TEXT;
ALTER TABLE messages_log ADD COLUMN line_account_id TEXT;
ALTER TABLE messages_log ADD COLUMN template_id_at_send TEXT;

CREATE INDEX IF NOT EXISTS idx_messages_log_broadcast_id ON messages_log (broadcast_id);
CREATE INDEX IF NOT EXISTS idx_messages_log_friend_id ON messages_log (friend_id);
CREATE INDEX IF NOT EXISTS idx_messages_log_created_at ON messages_log (created_at);
CREATE INDEX IF NOT EXISTS idx_messages_log_friend_source ON messages_log (friend_id, source);
CREATE INDEX IF NOT EXISTS idx_messages_log_friend_direction_created ON messages_log (friend_id, direction, created_at);


-- ============================================================
-- 2. scenarios  (migration 037_scenario_delivery_mode / 元DDLをコメントから復元)
-- ============================================================
ALTER TABLE scenarios ADD COLUMN delivery_mode TEXT NOT NULL DEFAULT 'relative'
  CHECK (delivery_mode IN ('relative', 'elapsed', 'absolute_time'));


-- ============================================================
-- 3. scenario_steps  (migration 037_scenario_delivery_mode + 038_scenario_templates_and_stats)
-- ============================================================
ALTER TABLE scenario_steps ADD COLUMN offset_days INTEGER;
ALTER TABLE scenario_steps ADD COLUMN offset_minutes INTEGER;
ALTER TABLE scenario_steps ADD COLUMN delivery_time TEXT;
ALTER TABLE scenario_steps ADD COLUMN template_id TEXT REFERENCES templates(id) ON DELETE SET NULL;
ALTER TABLE scenario_steps ADD COLUMN on_reach_tag_id TEXT REFERENCES tags(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_scenario_steps_scenario_id ON scenario_steps (scenario_id);


-- ============================================================
-- 4. auto_replies  (migration 033_auto_replies_template_id)
-- ============================================================
ALTER TABLE auto_replies ADD COLUMN template_id TEXT REFERENCES templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_auto_replies_template_id ON auto_replies (template_id);


-- ============================================================
-- 5. broadcasts  (migrations 029 Part2 / 030 / 031) ※ target_type CHECK は据え置き
-- ============================================================
ALTER TABLE broadcasts ADD COLUMN account_ids TEXT
  CHECK (account_ids IS NULL OR json_valid(account_ids));
ALTER TABLE broadcasts ADD COLUMN dedup_priority TEXT
  CHECK (dedup_priority IS NULL OR json_valid(dedup_priority));
ALTER TABLE broadcasts ADD COLUMN failed_account_ids TEXT
  CHECK (failed_account_ids IS NULL OR json_valid(failed_account_ids));
ALTER TABLE broadcasts ADD COLUMN dedup_progress TEXT;
ALTER TABLE broadcasts ADD COLUMN batch_lock_at TEXT;


-- ============================================================
-- 6. line_accounts  (migration 029 Part1 / カラムは既存・index のみ補完)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_line_accounts_display_order
  ON line_accounts (display_order, created_at);


-- ============================================================
-- 7. entry_routes  (migration 038_entry_routes_pool_and_push) ※流入経路ページ
-- ============================================================
ALTER TABLE entry_routes ADD COLUMN pool_id TEXT REFERENCES traffic_pools (id) ON DELETE SET NULL;
ALTER TABLE entry_routes ADD COLUMN intro_template_id TEXT REFERENCES message_templates (id) ON DELETE SET NULL;
ALTER TABLE entry_routes ADD COLUMN run_account_friend_add_scenarios INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_entry_routes_pool ON entry_routes (pool_id);


-- ============================================================
-- 8. Booking 機能テーブル  (migration 036_booking) ※本番に未作成
-- ============================================================
CREATE TABLE IF NOT EXISTS menus (
  id                    TEXT PRIMARY KEY,
  line_account_id       TEXT NOT NULL,
  name                  TEXT NOT NULL,
  category_label        TEXT,
  description           TEXT,
  duration_minutes      INTEGER NOT NULL,
  buffer_after_minutes  INTEGER NOT NULL DEFAULT 0,
  base_price            INTEGER NOT NULL,
  sort_order            INTEGER NOT NULL DEFAULT 0,
  is_active             INTEGER NOT NULL DEFAULT 1,
  deleted_at            TEXT,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  FOREIGN KEY (line_account_id) REFERENCES line_accounts(id)
);
CREATE INDEX IF NOT EXISTS idx_menus_account_sort ON menus (line_account_id, sort_order);

CREATE TABLE IF NOT EXISTS staff (
  id                       TEXT PRIMARY KEY,
  line_account_id          TEXT NOT NULL,
  name                     TEXT NOT NULL,
  display_name             TEXT NOT NULL,
  role                     TEXT,
  profile_image_url        TEXT,
  bio                      TEXT,
  sort_order               INTEGER NOT NULL DEFAULT 0,
  is_designation_optional  INTEGER NOT NULL DEFAULT 0,
  is_active                INTEGER NOT NULL DEFAULT 1,
  deleted_at               TEXT,
  created_at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  updated_at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  FOREIGN KEY (line_account_id) REFERENCES line_accounts(id)
);
CREATE INDEX IF NOT EXISTS idx_staff_account_sort ON staff (line_account_id, sort_order);

CREATE TABLE IF NOT EXISTS staff_menus (
  staff_id                  TEXT NOT NULL,
  menu_id                   TEXT NOT NULL,
  is_offered                INTEGER NOT NULL DEFAULT 1,
  override_duration_minutes INTEGER,
  override_price            INTEGER,
  PRIMARY KEY (staff_id, menu_id),
  FOREIGN KEY (staff_id) REFERENCES staff(id),
  FOREIGN KEY (menu_id) REFERENCES menus(id)
);

CREATE TABLE IF NOT EXISTS staff_shifts (
  id          TEXT PRIMARY KEY,
  staff_id    TEXT NOT NULL,
  work_date   TEXT NOT NULL,
  start_time  TEXT NOT NULL,
  end_time    TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  UNIQUE (staff_id, work_date),
  FOREIGN KEY (staff_id) REFERENCES staff(id)
);
CREATE INDEX IF NOT EXISTS idx_shifts_staff_date ON staff_shifts (staff_id, work_date);

CREATE TABLE IF NOT EXISTS bookings (
  id                      TEXT PRIMARY KEY,
  line_account_id         TEXT NOT NULL,
  friend_id               TEXT NOT NULL,
  staff_id                TEXT NOT NULL,
  menu_id                 TEXT NOT NULL,
  starts_at               TEXT NOT NULL,
  ends_at                 TEXT NOT NULL,
  block_ends_at           TEXT NOT NULL,
  status                  TEXT NOT NULL CHECK (status IN ('requested','confirmed','rejected','expired','cancelled','completed','no_show')),
  customer_note           TEXT,
  internal_note           TEXT,
  price_at_booking        INTEGER NOT NULL,
  requested_at            TEXT NOT NULL,
  decided_at              TEXT,
  decided_by_staff_id     TEXT,
  external_event_id       TEXT,
  external_calendar_id    TEXT,
  created_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  updated_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  FOREIGN KEY (line_account_id) REFERENCES line_accounts(id),
  FOREIGN KEY (friend_id) REFERENCES friends(id),
  FOREIGN KEY (staff_id) REFERENCES staff(id),
  FOREIGN KEY (menu_id) REFERENCES menus(id)
);
CREATE INDEX IF NOT EXISTS idx_bookings_account_status_starts ON bookings (line_account_id, status, starts_at);
CREATE INDEX IF NOT EXISTS idx_bookings_staff_overlap ON bookings (staff_id, status, starts_at, block_ends_at);
CREATE INDEX IF NOT EXISTS idx_bookings_friend_starts ON bookings (friend_id, starts_at DESC);

CREATE TABLE IF NOT EXISTS booking_idempotency_keys (
  key              TEXT PRIMARY KEY,
  line_account_id  TEXT NOT NULL,
  friend_id        TEXT NOT NULL,
  response_status  INTEGER NOT NULL,
  response_body    TEXT NOT NULL,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  expires_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON booking_idempotency_keys (expires_at);

CREATE TABLE IF NOT EXISTS booking_reminders (
  id            TEXT PRIMARY KEY,
  booking_id    TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('day_before','hours_before')),
  scheduled_at  TEXT NOT NULL,
  sent_at       TEXT,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','failed_permanent','cancelled')),
  retry_count   INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT,
  FOREIGN KEY (booking_id) REFERENCES bookings(id)
);
CREATE INDEX IF NOT EXISTS idx_reminders_status_scheduled ON booking_reminders (status, scheduled_at);


-- ============================================================
-- 9. Event Booking テーブル  (migration 037_event_booking) ※本番に未作成
-- ============================================================
CREATE TABLE IF NOT EXISTS events (
  id                            TEXT PRIMARY KEY,
  line_account_id               TEXT NOT NULL,
  name                          TEXT NOT NULL,
  venue_name                    TEXT,
  venue_url                     TEXT,
  image_url                     TEXT,
  description                   TEXT,
  description_centered          INTEGER NOT NULL DEFAULT 0,
  max_bookings_per_friend       INTEGER,
  requires_approval             INTEGER NOT NULL DEFAULT 0,
  cancel_deadline_hours_before  INTEGER,
  reminder_day_before_enabled   INTEGER NOT NULL DEFAULT 1,
  reminder_hours_before         INTEGER,
  is_published                  INTEGER NOT NULL DEFAULT 0,
  folder_id                     TEXT,
  sort_order                    INTEGER NOT NULL DEFAULT 0,
  deleted_at                    TEXT,
  created_at                    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  updated_at                    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  FOREIGN KEY (line_account_id) REFERENCES line_accounts(id)
);
CREATE INDEX IF NOT EXISTS idx_events_account_published_sort ON events (line_account_id, is_published, sort_order);

CREATE TABLE IF NOT EXISTS event_slots (
  id          TEXT PRIMARY KEY,
  event_id    TEXT NOT NULL,
  starts_at   TEXT NOT NULL,
  ends_at     TEXT NOT NULL,
  capacity    INTEGER,
  is_active   INTEGER NOT NULL DEFAULT 1,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  deleted_at  TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  FOREIGN KEY (event_id) REFERENCES events(id)
);
CREATE INDEX IF NOT EXISTS idx_event_slots_event_starts ON event_slots (event_id, starts_at);

CREATE TABLE IF NOT EXISTS event_bookings (
  id                    TEXT PRIMARY KEY,
  line_account_id       TEXT NOT NULL,
  event_id              TEXT NOT NULL,
  slot_id               TEXT NOT NULL,
  friend_id             TEXT NOT NULL,
  status                TEXT NOT NULL CHECK (status IN ('requested','confirmed','rejected','cancelled','expired','no_show','attended')),
  customer_note         TEXT,
  internal_note         TEXT,
  requested_at          TEXT NOT NULL,
  decided_at            TEXT,
  decided_by_staff_id   TEXT,
  cancelled_at          TEXT,
  cancelled_by          TEXT CHECK (cancelled_by IN ('friend','admin','system')),
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  FOREIGN KEY (line_account_id) REFERENCES line_accounts(id),
  FOREIGN KEY (event_id) REFERENCES events(id),
  FOREIGN KEY (slot_id) REFERENCES event_slots(id),
  FOREIGN KEY (friend_id) REFERENCES friends(id)
);
CREATE INDEX IF NOT EXISTS idx_event_bookings_account_status_event ON event_bookings (line_account_id, status, event_id);
CREATE INDEX IF NOT EXISTS idx_event_bookings_slot_status ON event_bookings (slot_id, status);
CREATE INDEX IF NOT EXISTS idx_event_bookings_friend_requested ON event_bookings (friend_id, requested_at DESC);

CREATE TABLE IF NOT EXISTS event_booking_reminders (
  id            TEXT PRIMARY KEY,
  booking_id    TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('day_before','hours_before')),
  scheduled_at  TEXT NOT NULL,
  sent_at       TEXT,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','failed_permanent','cancelled')),
  retry_count   INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT,
  FOREIGN KEY (booking_id) REFERENCES event_bookings(id)
);
CREATE INDEX IF NOT EXISTS idx_event_booking_reminders_status_scheduled ON event_booking_reminders (status, scheduled_at);

CREATE TABLE IF NOT EXISTS event_booking_idempotency_keys (
  key              TEXT PRIMARY KEY,
  line_account_id  TEXT NOT NULL,
  friend_id        TEXT NOT NULL,
  response_status  INTEGER NOT NULL,
  response_body    TEXT NOT NULL,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  expires_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_event_booking_idempotency_expires ON event_booking_idempotency_keys (expires_at);


-- ============================================================
-- 10. events / event_bookings multi-account 拡張  (migration 040_events_multi_account)
--     ※ 上記 9 でテーブル作成済みのため後段で ALTER
-- ============================================================
ALTER TABLE events ADD COLUMN target_type TEXT NOT NULL DEFAULT 'single'
  CHECK (target_type IN ('single', 'multi-account-dedup'));
ALTER TABLE events ADD COLUMN account_ids TEXT
  CHECK (account_ids IS NULL OR json_valid(account_ids));
ALTER TABLE events ADD COLUMN dedup_priority TEXT
  CHECK (dedup_priority IS NULL OR json_valid(dedup_priority));
ALTER TABLE events ADD COLUMN failed_account_ids TEXT
  CHECK (failed_account_ids IS NULL OR json_valid(failed_account_ids));

ALTER TABLE event_bookings ADD COLUMN identity_key TEXT;
CREATE INDEX IF NOT EXISTS idx_event_bookings_identity_status
  ON event_bookings (event_id, identity_key, status);
