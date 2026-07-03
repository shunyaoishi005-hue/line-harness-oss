-- =============================================================================
-- 本番 D1 (line-crm) データ backfill / seed  Part B  2026-05-28
-- =============================================================================
-- Part A (prod_schema_reconcile_2026-05-28.sql) 適用後に任意で実行する DML。
-- 未適用 migration の「データ部分」だけを冪等化して抽出したもの。
-- 行削除なし・NULL 埋め / INSERT OR IGNORE のみ。
-- =============================================================================

-- 028: messages_log.source を既存履歴に推定 backfill
UPDATE messages_log SET source = 'user'      WHERE direction = 'incoming' AND source IS NULL;
UPDATE messages_log SET source = 'broadcast' WHERE direction = 'outgoing' AND broadcast_id IS NOT NULL AND source IS NULL;
UPDATE messages_log SET source = 'broadcast' WHERE direction = 'outgoing' AND delivery_type = 'test' AND source IS NULL;
UPDATE messages_log SET source = 'scenario'  WHERE direction = 'outgoing' AND scenario_step_id IS NOT NULL AND source IS NULL;
UPDATE messages_log SET source = 'auto_reply' WHERE direction = 'outgoing' AND delivery_type = 'reply' AND source IS NULL;
UPDATE messages_log SET source = 'manual'    WHERE source IS NULL AND direction = 'outgoing';

-- 029: line_accounts.display_order を created_at 順で採番 (現状全て 0)
UPDATE line_accounts SET display_order = (
  SELECT COUNT(*) FROM line_accounts la2
  WHERE la2.created_at < line_accounts.created_at
     OR (la2.created_at = line_accounts.created_at AND la2.id < line_accounts.id)
) WHERE display_order = 0;

-- 031: 配信中ロック状態で止まっている broadcast の救済 (該当なければ 0 件)
UPDATE broadcasts
   SET batch_lock_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')
 WHERE status = 'sending' AND batch_offset = -1 AND batch_lock_at IS NULL;

-- 039: 既定 'main' プールを作成し、未所属の LINE アカウントを編入
INSERT OR IGNORE INTO traffic_pools (id, slug, name, active_account_id, is_active, created_at, updated_at)
SELECT lower(hex(randomblob(16))), 'main', 'メインプール',
       (SELECT id FROM line_accounts ORDER BY created_at ASC LIMIT 1),
       1, datetime('now'), datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM traffic_pools WHERE slug = 'main')
  AND EXISTS (SELECT 1 FROM line_accounts);

INSERT OR IGNORE INTO pool_accounts (id, pool_id, line_account_id, is_active, created_at)
SELECT lower(hex(randomblob(16))),
       (SELECT id FROM traffic_pools WHERE slug = 'main'),
       la.id, 1, datetime('now')
FROM line_accounts la
WHERE EXISTS (SELECT 1 FROM traffic_pools WHERE slug = 'main')
  AND NOT EXISTS (SELECT 1 FROM pool_accounts pa WHERE pa.line_account_id = la.id);

-- 040: event_bookings.identity_key backfill (既存 0 件想定)
UPDATE event_bookings SET identity_key = 'solo:' || id WHERE identity_key IS NULL;
