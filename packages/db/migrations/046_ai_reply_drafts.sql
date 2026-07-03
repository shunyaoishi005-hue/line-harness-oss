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

INSERT OR IGNORE INTO ai_knowledge_items (id, client, knowledge_scope, category, content, tags, is_active)
VALUES
  (
    'structure_partners_cad_sidejob_2026_06_09',
    'ストラクチュア様',
    'structure_partners',
    '副業CAD案件',
    'ストラクチュアパートナーズでは、副業CAD・図面作成系の案件を紹介できる。週5時間未満の人には、最初から高単価・重めの申請案件を出しすぎず、CAD化・平面図/立面図作成など小さめに試しやすい案件から見せる。案件例: CAD化・平面図/立面図作成は12,000円前後、住宅/実施図面CADオペは35,000円前後、リノベーション図面CADオペは55,000円前後、確認申請まわりの図面作成は75,000〜125,000円前後。LINE上では詳細な顧客名・個人名・内部情報は出しすぎず、気になる案件番号や面談希望を聞いて個別確認へ進める。',
    '["ストラクチュア","副業CAD","週5時間未満","案件紹介","単価目安"]',
    1
  );
