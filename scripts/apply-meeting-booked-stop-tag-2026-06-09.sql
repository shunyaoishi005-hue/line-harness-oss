-- Stop scheduled nurture messages after the operator adds 面談予約済み.
-- The tag already exists in production:
--   面談予約済み = d4d7996a-96d4-4cf5-b819-9017f0b2a67b

UPDATE scenario_steps
SET
  condition_type = 'tag_not_exists',
  condition_value = 'd4d7996a-96d4-4cf5-b819-9017f0b2a67b'
WHERE condition_type IS NULL
  AND scenario_id IN (
    SELECT id
    FROM scenarios
    WHERE name IN (
      'SP_診断後_副業案件ルート_v1',
      'SP_診断後_フリーランスルート_v1',
      'SP_診断後_情報収集ルート_v1',
      '副業検討ルート',
      '独立検討ルート'
    )
  );

-- Backfill safety: if a friend already has the stop tag, complete any pending scenario.
UPDATE friend_scenarios
SET
  status = 'completed',
  next_delivery_at = NULL,
  updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')
WHERE status != 'completed'
  AND friend_id IN (
    SELECT ft.friend_id
    FROM friend_tags ft
    JOIN tags t ON t.id = ft.tag_id
    WHERE t.name IN ('面談予約済み', '面談実施済み')
  );
