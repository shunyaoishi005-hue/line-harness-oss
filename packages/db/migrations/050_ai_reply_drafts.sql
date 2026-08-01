CREATE TABLE IF NOT EXISTS ai_reply_presets (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  prompt        TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'))
);

CREATE TABLE IF NOT EXISTS ai_knowledge_items (
  id              TEXT PRIMARY KEY,
  client          TEXT NOT NULL,
  knowledge_scope TEXT NOT NULL,
  category        TEXT NOT NULL,
  content         TEXT NOT NULL,
  tags            TEXT NOT NULL DEFAULT '[]',
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'))
);

CREATE TABLE IF NOT EXISTS ai_draft_logs (
  id              TEXT PRIMARY KEY,
  chat_id         TEXT,
  friend_id       TEXT,
  preset_id       TEXT,
  knowledge_scope TEXT,
  success         INTEGER NOT NULL DEFAULT 0,
  accepted        INTEGER NOT NULL DEFAULT 0,
  error_type      TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  accepted_at     TEXT
);

CREATE INDEX IF NOT EXISTS idx_ai_reply_presets_active_order
  ON ai_reply_presets (is_active, display_order);
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_scope_active
  ON ai_knowledge_items (knowledge_scope, is_active);
CREATE INDEX IF NOT EXISTS idx_ai_draft_logs_chat_created
  ON ai_draft_logs (chat_id, created_at);

INSERT OR IGNORE INTO ai_reply_presets (id, name, prompt, display_order, is_active)
VALUES
  ('short_polite', '丁寧・短め', '1〜3文で、自然で丁寧に返信してください。相手の発言を受け止め、必要なら次の一歩だけを聞いてください。', 10, 1),
  ('friendly_hearing', '親身にヒアリング', '相手の不安や状況に寄り添いながら、稼働時間・CAD経験・希望単価・面談可否のうち不足している情報を1つだけ確認してください。', 20, 1),
  ('project_intro', '案件紹介', '相手の条件に近い案件候補を簡潔に紹介してください。単価は必ず目安・前後と表現し、詳細な顧客名や内部情報は出しすぎないでください。', 30, 1),
  ('meeting_offer', '面談誘導', '売り込みに見えない自然な流れで、15〜20分ほどの面談相談に誘導してください。相手が断りやすい余白も残してください。', 40, 1);

-- NOTE: tenant-specific ai_knowledge_items rows are seeded per deployment
-- (not in this migration). Register knowledge via the admin UI or a private seed script.

