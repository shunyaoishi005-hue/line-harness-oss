-- Structure Partners: replace manual meeting scheduling replies with TimeRex URL.
-- Target account:
--   structure（ストラクチュア） = 7da71306-4602-421c-95fb-306ff6936c09

UPDATE auto_replies
SET
  response_type = 'text',
  response_content = '無料オンライン面談はこちらからご予約ください。

空いている日時を選ぶだけで予約が完了します。
予約完了後、Google MeetのURLがメールで届きます。

https://timerex.net/s/m.yamada_d69e_6a17/713ec075',
  is_active = 1
WHERE keyword = 'menu_schedule';

INSERT INTO auto_replies (
  id,
  keyword,
  match_type,
  response_type,
  response_content,
  template_id,
  line_account_id,
  is_active,
  created_at
)
SELECT
  lower(hex(randomblob(16))),
  'menu_schedule',
  'exact',
  'text',
  '無料オンライン面談はこちらからご予約ください。

空いている日時を選ぶだけで予約が完了します。
予約完了後、Google MeetのURLがメールで届きます。

https://timerex.net/s/m.yamada_d69e_6a17/713ec075',
  NULL,
  NULL,
  1,
  strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')
WHERE NOT EXISTS (
  SELECT 1 FROM auto_replies WHERE keyword = 'menu_schedule'
);

UPDATE auto_replies
SET
  match_type = 'contains',
  response_type = 'text',
  response_content = '無料オンライン面談はこちらからご予約ください。

空いている日時を選ぶだけで予約が完了します。
予約完了後、Google MeetのURLがメールで届きます。

https://timerex.net/s/m.yamada_d69e_6a17/713ec075',
  is_active = 1
WHERE keyword IN ('面談', '予約', '無料面談');

INSERT INTO auto_replies (
  id,
  keyword,
  match_type,
  response_type,
  response_content,
  template_id,
  line_account_id,
  is_active,
  created_at
)
SELECT
  lower(hex(randomblob(16))),
  v.keyword,
  'contains',
  'text',
  '無料オンライン面談はこちらからご予約ください。

空いている日時を選ぶだけで予約が完了します。
予約完了後、Google MeetのURLがメールで届きます。

https://timerex.net/s/m.yamada_d69e_6a17/713ec075',
  NULL,
  NULL,
  1,
  strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')
FROM (
  SELECT '面談' AS keyword
  UNION ALL SELECT '予約'
  UNION ALL SELECT '無料面談'
) v
WHERE NOT EXISTS (
  SELECT 1 FROM auto_replies ar WHERE ar.keyword = v.keyword
);

UPDATE auto_replies
SET
  match_type = 'exact',
  response_type = 'text',
  response_content = '無料オンライン面談はこちらからご予約ください。

空いている日時を選ぶだけで予約が完了します。
予約完了後、Google MeetのURLがメールで届きます。

https://timerex.net/s/m.yamada_d69e_6a17/713ec075',
  is_active = 1
WHERE keyword = '無料面談を希望';

INSERT INTO auto_replies (
  id,
  keyword,
  match_type,
  response_type,
  response_content,
  template_id,
  line_account_id,
  is_active,
  created_at
)
SELECT
  lower(hex(randomblob(16))),
  '無料面談を希望',
  'exact',
  'text',
  '無料オンライン面談はこちらからご予約ください。

空いている日時を選ぶだけで予約が完了します。
予約完了後、Google MeetのURLがメールで届きます。

https://timerex.net/s/m.yamada_d69e_6a17/713ec075',
  NULL,
  NULL,
  1,
  strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')
WHERE NOT EXISTS (
  SELECT 1 FROM auto_replies WHERE keyword = '無料面談を希望'
);
