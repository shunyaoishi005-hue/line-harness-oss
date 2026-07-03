-- Add message 2/3 for logs repaired from literal {{line_split}} rows.

INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, delivery_type, source, line_account_id, template_id_at_send, created_at)
SELECT lower(hex(randomblob(16))), friend_id, direction, message_type, 'SP-NDV36P', broadcast_id, scenario_step_id, delivery_type, source, line_account_id, template_id_at_send, substr(created_at, 1, 20) || printf('%03d', CAST(substr(created_at, 21, 3) AS INTEGER) + 1) || substr(created_at, 24)
FROM messages_log WHERE id='ed3df838-03f3-4adc-b645-097c14348f4b'
  AND NOT EXISTS (SELECT 1 FROM messages_log WHERE friend_id=(SELECT friend_id FROM messages_log WHERE id='ed3df838-03f3-4adc-b645-097c14348f4b') AND content='SP-NDV36P' AND created_at=substr((SELECT created_at FROM messages_log WHERE id='ed3df838-03f3-4adc-b645-097c14348f4b'), 1, 20) || printf('%03d', CAST(substr((SELECT created_at FROM messages_log WHERE id='ed3df838-03f3-4adc-b645-097c14348f4b'), 21, 3) AS INTEGER) + 1) || substr((SELECT created_at FROM messages_log WHERE id='ed3df838-03f3-4adc-b645-097c14348f4b'), 24));

INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, delivery_type, source, line_account_id, template_id_at_send, created_at)
SELECT lower(hex(randomblob(16))), friend_id, direction, message_type, '?????????LINE?
??????
?????????', broadcast_id, scenario_step_id, delivery_type, source, line_account_id, template_id_at_send, substr(created_at, 1, 20) || printf('%03d', CAST(substr(created_at, 21, 3) AS INTEGER) + 2) || substr(created_at, 24)
FROM messages_log WHERE id='ed3df838-03f3-4adc-b645-097c14348f4b'
  AND NOT EXISTS (SELECT 1 FROM messages_log WHERE friend_id=(SELECT friend_id FROM messages_log WHERE id='ed3df838-03f3-4adc-b645-097c14348f4b') AND content='?????????LINE?
??????
?????????' AND created_at=substr((SELECT created_at FROM messages_log WHERE id='ed3df838-03f3-4adc-b645-097c14348f4b'), 1, 20) || printf('%03d', CAST(substr((SELECT created_at FROM messages_log WHERE id='ed3df838-03f3-4adc-b645-097c14348f4b'), 21, 3) AS INTEGER) + 2) || substr((SELECT created_at FROM messages_log WHERE id='ed3df838-03f3-4adc-b645-097c14348f4b'), 24));

INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, delivery_type, source, line_account_id, template_id_at_send, created_at)
SELECT lower(hex(randomblob(16))), friend_id, direction, message_type, 'SP-BVCMH8', broadcast_id, scenario_step_id, delivery_type, source, line_account_id, template_id_at_send, substr(created_at, 1, 20) || printf('%03d', CAST(substr(created_at, 21, 3) AS INTEGER) + 1) || substr(created_at, 24)
FROM messages_log WHERE id='6a38fa6a-8689-4c29-b8ff-6bc16eb699ee'
  AND NOT EXISTS (SELECT 1 FROM messages_log WHERE friend_id=(SELECT friend_id FROM messages_log WHERE id='6a38fa6a-8689-4c29-b8ff-6bc16eb699ee') AND content='SP-BVCMH8' AND created_at=substr((SELECT created_at FROM messages_log WHERE id='6a38fa6a-8689-4c29-b8ff-6bc16eb699ee'), 1, 20) || printf('%03d', CAST(substr((SELECT created_at FROM messages_log WHERE id='6a38fa6a-8689-4c29-b8ff-6bc16eb699ee'), 21, 3) AS INTEGER) + 1) || substr((SELECT created_at FROM messages_log WHERE id='6a38fa6a-8689-4c29-b8ff-6bc16eb699ee'), 24));

INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, delivery_type, source, line_account_id, template_id_at_send, created_at)
SELECT lower(hex(randomblob(16))), friend_id, direction, message_type, '?????????LINE?
??????
?????????', broadcast_id, scenario_step_id, delivery_type, source, line_account_id, template_id_at_send, substr(created_at, 1, 20) || printf('%03d', CAST(substr(created_at, 21, 3) AS INTEGER) + 2) || substr(created_at, 24)
FROM messages_log WHERE id='6a38fa6a-8689-4c29-b8ff-6bc16eb699ee'
  AND NOT EXISTS (SELECT 1 FROM messages_log WHERE friend_id=(SELECT friend_id FROM messages_log WHERE id='6a38fa6a-8689-4c29-b8ff-6bc16eb699ee') AND content='?????????LINE?
??????
?????????' AND created_at=substr((SELECT created_at FROM messages_log WHERE id='6a38fa6a-8689-4c29-b8ff-6bc16eb699ee'), 1, 20) || printf('%03d', CAST(substr((SELECT created_at FROM messages_log WHERE id='6a38fa6a-8689-4c29-b8ff-6bc16eb699ee'), 21, 3) AS INTEGER) + 2) || substr((SELECT created_at FROM messages_log WHERE id='6a38fa6a-8689-4c29-b8ff-6bc16eb699ee'), 24));

INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, delivery_type, source, line_account_id, template_id_at_send, created_at)
SELECT lower(hex(randomblob(16))), friend_id, direction, message_type, '{{timerex_booking_code}}', broadcast_id, scenario_step_id, delivery_type, source, line_account_id, template_id_at_send, substr(created_at, 1, 20) || printf('%03d', CAST(substr(created_at, 21, 3) AS INTEGER) + 1) || substr(created_at, 24)
FROM messages_log WHERE id='674ccb26-d9e7-48cf-b277-3ee3fd723a50'
  AND NOT EXISTS (SELECT 1 FROM messages_log WHERE friend_id=(SELECT friend_id FROM messages_log WHERE id='674ccb26-d9e7-48cf-b277-3ee3fd723a50') AND content='{{timerex_booking_code}}' AND created_at=substr((SELECT created_at FROM messages_log WHERE id='674ccb26-d9e7-48cf-b277-3ee3fd723a50'), 1, 20) || printf('%03d', CAST(substr((SELECT created_at FROM messages_log WHERE id='674ccb26-d9e7-48cf-b277-3ee3fd723a50'), 21, 3) AS INTEGER) + 1) || substr((SELECT created_at FROM messages_log WHERE id='674ccb26-d9e7-48cf-b277-3ee3fd723a50'), 24));

INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, delivery_type, source, line_account_id, template_id_at_send, created_at)
SELECT lower(hex(randomblob(16))), friend_id, direction, message_type, '?????????LINE?
??????
?????????', broadcast_id, scenario_step_id, delivery_type, source, line_account_id, template_id_at_send, substr(created_at, 1, 20) || printf('%03d', CAST(substr(created_at, 21, 3) AS INTEGER) + 2) || substr(created_at, 24)
FROM messages_log WHERE id='674ccb26-d9e7-48cf-b277-3ee3fd723a50'
  AND NOT EXISTS (SELECT 1 FROM messages_log WHERE friend_id=(SELECT friend_id FROM messages_log WHERE id='674ccb26-d9e7-48cf-b277-3ee3fd723a50') AND content='?????????LINE?
??????
?????????' AND created_at=substr((SELECT created_at FROM messages_log WHERE id='674ccb26-d9e7-48cf-b277-3ee3fd723a50'), 1, 20) || printf('%03d', CAST(substr((SELECT created_at FROM messages_log WHERE id='674ccb26-d9e7-48cf-b277-3ee3fd723a50'), 21, 3) AS INTEGER) + 2) || substr((SELECT created_at FROM messages_log WHERE id='674ccb26-d9e7-48cf-b277-3ee3fd723a50'), 24));
