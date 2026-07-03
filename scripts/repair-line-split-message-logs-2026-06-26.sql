-- Repair previously logged auto-reply messages that stored {{line_split}} literally.
-- Keeps the original row as message 1 and inserts message 2/3 for admin chat display.

WITH rows AS (
  SELECT
    id,
    trim(substr(content, 1, instr(content, '{{line_split}}') - 1)) AS first_part
  FROM messages_log
  WHERE direction = 'outgoing'
    AND source = 'auto_reply'
    AND content LIKE '%{{line_split}}%'
)
UPDATE messages_log
SET content = (SELECT first_part FROM rows WHERE rows.id = messages_log.id)
WHERE id IN (SELECT id FROM rows);

WITH rows AS (
  SELECT
    friend_id,
    direction,
    message_type,
    broadcast_id,
    scenario_step_id,
    delivery_type,
    source,
    line_account_id,
    template_id_at_send,
    created_at,
    substr(content, instr(content, '{{line_split}}') + length('{{line_split}}')) AS rest
  FROM messages_log
  WHERE direction = 'outgoing'
    AND source = 'auto_reply'
    AND content LIKE '%{{line_split}}%'
), parts AS (
  SELECT
    friend_id,
    direction,
    message_type,
    trim(substr(rest, 1, instr(rest, '{{line_split}}') - 1)) AS content,
    broadcast_id,
    scenario_step_id,
    delivery_type,
    source,
    line_account_id,
    template_id_at_send,
    substr(created_at, 1, 20) || printf('%03d', CAST(substr(created_at, 21, 3) AS INTEGER) + 1) || substr(created_at, 24) AS created_at
  FROM rows
  WHERE rest LIKE '%{{line_split}}%'
)
INSERT INTO messages_log (
  id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id,
  delivery_type, source, line_account_id, template_id_at_send, created_at
)
SELECT lower(hex(randomblob(16))), friend_id, direction, message_type, content, broadcast_id, scenario_step_id,
       delivery_type, source, line_account_id, template_id_at_send, created_at
FROM parts
WHERE content <> '';

WITH rows AS (
  SELECT
    friend_id,
    direction,
    message_type,
    broadcast_id,
    scenario_step_id,
    delivery_type,
    source,
    line_account_id,
    template_id_at_send,
    created_at,
    substr(content, instr(content, '{{line_split}}') + length('{{line_split}}')) AS rest
  FROM messages_log
  WHERE direction = 'outgoing'
    AND source = 'auto_reply'
    AND content LIKE '%{{line_split}}%'
), parts AS (
  SELECT
    friend_id,
    direction,
    message_type,
    trim(substr(rest, instr(rest, '{{line_split}}') + length('{{line_split}}'))) AS content,
    broadcast_id,
    scenario_step_id,
    delivery_type,
    source,
    line_account_id,
    template_id_at_send,
    substr(created_at, 1, 20) || printf('%03d', CAST(substr(created_at, 21, 3) AS INTEGER) + 2) || substr(created_at, 24) AS created_at
  FROM rows
  WHERE rest LIKE '%{{line_split}}%'
)
INSERT INTO messages_log (
  id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id,
  delivery_type, source, line_account_id, template_id_at_send, created_at
)
SELECT lower(hex(randomblob(16))), friend_id, direction, message_type, content, broadcast_id, scenario_step_id,
       delivery_type, source, line_account_id, template_id_at_send, created_at
FROM parts
WHERE content <> '';
