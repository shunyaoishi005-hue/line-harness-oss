-- TimeRex booking URL:
-- https://timerex.net/s/m.yamada_d69e_6a17/713ec075

-- 1) Keep broad booking replies on the URL flow and ask the user to self-report completion.
UPDATE auto_replies
SET response_type = 'text',
    response_content = '無料オンライン面談はこちらからご予約ください。

空いている日時を選ぶだけで予約が完了します。
予約後、Google MeetのURLがメールで届きます。

https://timerex.net/s/m.yamada_d69e_6a17/713ec075

予約が完了したら、運営側で確認できるように、このLINEに「予約完了」と送ってください。'
WHERE keyword IN ('menu_schedule', '面談', '予約', '無料面談')
  AND is_active = 1;

-- "無料面談を希望" has an automation below, so keep the auto_reply silent to avoid duplicate replies.
UPDATE auto_replies
SET response_type = 'silent',
    response_content = ''
WHERE keyword = '無料面談を希望'
  AND is_active = 1;

-- 2) Replace manual scheduling copy in legacy/global auto replies.
UPDATE auto_replies
SET response_type = 'text',
    response_content = 'ご相談ありがとうございます。

無料オンライン面談は下記URLからご予約ください。
空いている日時を選ぶだけで予約が完了し、予約後にGoogle MeetのURLがメールで届きます。

https://timerex.net/s/m.yamada_d69e_6a17/713ec075

予約が完了したら、運営側で確認できるように、このLINEに「予約完了」と送ってください。
ご質問があれば、このままLINEにお送りください。'
WHERE keyword IN ('飴田さんに相談したい', '山田さんに相談したい', '福平さんに相談したい', '独立の話を聞きたい', '詳細を聞きたい', '案件について相談したいです！')
  AND is_active = 1;

UPDATE auto_replies
SET response_type = 'text',
    response_content = 'ご興味ありがとうございます。

案件詳細や進め方は、無料オンライン面談で確認できます。
下記URLからご都合のよい日時をご予約ください。

https://timerex.net/s/m.yamada_d69e_6a17/713ec075

予約が完了したら、運営側で確認できるように、このLINEに「予約完了」と送ってください。'
WHERE keyword = 'やってみたい'
  AND is_active = 1;

UPDATE auto_replies
SET response_type = 'text',
    response_content = 'ご相談ありがとうございます。

無料オンライン面談は下記URLからご予約ください。
空いている日時を選ぶだけで予約が完了します。

https://timerex.net/s/m.yamada_d69e_6a17/713ec075

予約が完了したら、運営側で確認できるように、このLINEに「予約完了」と送ってください。
まず質問だけしたい場合は、このままLINEにご記入ください。'
WHERE keyword = 'flow=consult'
  AND is_active = 1;

UPDATE auto_replies
SET response_type = 'text',
    response_content = 'ありがとうございます。

無料オンライン面談は下記URLからご予約ください。
予約後、Google MeetのURLがメールで届きます。

https://timerex.net/s/m.yamada_d69e_6a17/713ec075

予約が完了したら、運営側で確認できるように、このLINEに「予約完了」と送ってください。'
WHERE keyword = 'consult_pref=book'
  AND is_active = 1;

-- 3) Silent guards so "予約完了しました" does not get swallowed by the broad "予約" auto reply.
UPDATE auto_replies
SET match_type = 'contains',
    response_type = 'silent',
    response_content = '',
    is_active = 1
WHERE keyword = '予約完了';

INSERT INTO auto_replies (id, keyword, match_type, response_type, response_content, line_account_id, is_active, created_at, enroll_scenario_id, template_id)
SELECT 'ar_timerex_booking_done_silent_20260618', '予約完了', 'contains', 'silent', '', NULL, 1, '2026-01-01T00:00:00.000+09:00', NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM auto_replies WHERE keyword = '予約完了');

UPDATE auto_replies
SET match_type = 'contains',
    response_type = 'silent',
    response_content = '',
    is_active = 1
WHERE keyword = '日程変更';

INSERT INTO auto_replies (id, keyword, match_type, response_type, response_content, line_account_id, is_active, created_at, enroll_scenario_id, template_id)
SELECT 'ar_timerex_reschedule_silent_20260618', '日程変更', 'contains', 'silent', '', NULL, 1, '2026-01-01T00:00:01.000+09:00', NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM auto_replies WHERE keyword = '日程変更');

-- 4) Optimize step delivery copy from "reply and wait for manual scheduling" to direct URL booking.
UPDATE scenario_steps
SET message_content = '昨日ご案内した副業案件について、よくある不安を整理します。

多いのはこの3つです。
・本業と両立できるか
・会社規定に問題がないか
・今のスキルで案件を受けられるか

無理に案件を受ける必要はありません。
まずは、今の働き方で受けられる案件があるかを無料オンライン面談で一緒に確認できます。

予約はこちらからできます。
https://timerex.net/s/m.yamada_d69e_6a17/713ec075

予約が完了したら、このLINEに「予約完了」と送ってください。'
WHERE id = '5ccb1970-b681-4aed-b255-b3181f082352';

UPDATE scenario_steps
SET message_content = '副業を始めるときは、最初から大きな案件を受けるより、小さく試して相性を見る方が安心です。

Structure Partnersでは、稼働時間や得意領域に合わせて、無理のない案件から相談できます。

案件の向き不向きは無料オンライン面談で確認できます。
下記URLからご都合のよい日時をご予約ください。

https://timerex.net/s/m.yamada_d69e_6a17/713ec075

予約が完了したら、このLINEに「予約完了」と送ってください。'
WHERE id = '1300a1dc-9d32-4e6b-b122-a527c9719d4d';

UPDATE scenario_steps
SET message_content = '副業案件について、少しでも具体的に知りたくなったら無料面談で確認できます。

売り込みではなく、今のスキル・稼働時間で合う案件があるかを確認する場です。

予約はこちらからできます。
https://timerex.net/s/m.yamada_d69e_6a17/713ec075

予約が完了したら、このLINEに「予約完了」と送ってください。'
WHERE id = 'a0159b3f-ae65-4e2e-bef9-e6a1ed97b039';

UPDATE scenario_steps
SET message_content = '案件や働き方について、少しでも具体的に知りたくなったら無料面談で確認できます。

売り込みではなく、今のスキル・稼働時間で合う案件があるかを確認する場です。

予約はこちらからできます。
https://timerex.net/s/m.yamada_d69e_6a17/713ec075

予約が完了したら、このLINEに「予約完了」と送ってください。'
WHERE id = 'b3a600fc-b7a5-4de9-9dd2-5e0c1f09f514';

UPDATE scenario_steps
SET message_content = '継続案件や外注パートナー相談を希望する場合は、無料オンライン面談で現在の体制・得意領域・希望条件を確認できます。

下記URLからご都合のよい日時をご予約ください。

https://timerex.net/s/m.yamada_d69e_6a17/713ec075

予約が完了したら、このLINEに「予約完了」と送ってください。'
WHERE id = '08ee2957-23b8-41fb-9ae3-9728e2c1f94e';

-- 5) Optimize current CTA automations.
UPDATE automations
SET actions = '[{"type":"add_tag","params":{"tagId":"6b381edb-8f56-4eca-b83f-282480ee231a"}},{"type":"add_tag","params":{"tagId":"7c00fa01-65c0-4b0d-b5a2-2ee27487147a"}},{"type":"add_tag","params":{"tagId":"51653388-9f63-47c4-a7b0-133e06592878"}},{"type":"add_tag","params":{"tagId":"400e8237-7b6d-4d4d-bc27-ad4f5389fb72"}},{"type":"send_message","params":{"messageType":"text","content":"ありがとうございます。副業案件については無料オンライン面談で、現在の稼働時間や得意領域に合う案件を確認できます。\n\n下記URLからご都合のよい日時をご予約ください。\nhttps://timerex.net/s/m.yamada_d69e_6a17/713ec075\n\n予約が完了したら、運営側で確認できるように、このLINEに「予約完了」と送ってください。"}}]',
    updated_at = strftime('%Y-%m-%dT%H:%M:%f+09:00', 'now', '+9 hours')
WHERE name = 'SP案件CTA_副業案件相談';

UPDATE automations
SET actions = '[{"type":"add_tag","params":{"tagId":"6b381edb-8f56-4eca-b83f-282480ee231a"}},{"type":"add_tag","params":{"tagId":"d2180db6-a8fc-479a-b280-61b156d26a36"}},{"type":"add_tag","params":{"tagId":"51653388-9f63-47c4-a7b0-133e06592878"}},{"type":"add_tag","params":{"tagId":"400e8237-7b6d-4d4d-bc27-ad4f5389fb72"}},{"type":"send_message","params":{"messageType":"text","content":"ありがとうございます。継続案件や外注パートナー相談は無料オンライン面談で、現在の体制・得意領域・希望条件を確認できます。\n\n下記URLからご都合のよい日時をご予約ください。\nhttps://timerex.net/s/m.yamada_d69e_6a17/713ec075\n\n予約が完了したら、運営側で確認できるように、このLINEに「予約完了」と送ってください。"}}]',
    updated_at = strftime('%Y-%m-%dT%H:%M:%f+09:00', 'now', '+9 hours')
WHERE name = 'SP案件CTA_継続案件相談';

UPDATE automations
SET actions = '[{"type":"add_tag","params":{"tagId":"6b381edb-8f56-4eca-b83f-282480ee231a"}},{"type":"add_tag","params":{"tagId":"51653388-9f63-47c4-a7b0-133e06592878"}},{"type":"add_tag","params":{"tagId":"400e8237-7b6d-4d4d-bc27-ad4f5389fb72"}},{"type":"send_message","params":{"messageType":"text","content":"ありがとうございます。今のスキル・稼働時間で合う案件があるか、無料オンライン面談で確認できます。\n\n下記URLからご都合のよい日時をご予約ください。\nhttps://timerex.net/s/m.yamada_d69e_6a17/713ec075\n\n予約が完了したら、運営側で確認できるように、このLINEに「予約完了」と送ってください。"}}]',
    updated_at = strftime('%Y-%m-%dT%H:%M:%f+09:00', 'now', '+9 hours')
WHERE name = 'SP案件CTA_無料面談希望';

UPDATE automations
SET actions = '[{"type":"add_tag","params":{"tagId":"6b381edb-8f56-4eca-b83f-282480ee231a"}},{"type":"add_tag","params":{"tagId":"d2180db6-a8fc-479a-b280-61b156d26a36"}},{"type":"add_tag","params":{"tagId":"51653388-9f63-47c4-a7b0-133e06592878"}},{"type":"add_tag","params":{"tagId":"400e8237-7b6d-4d4d-bc27-ad4f5389fb72"}},{"type":"send_message","params":{"messageType":"text","content":"ありがとうございます。案件相談は無料オンライン面談で、現在の体制・得意領域・希望条件を確認できます。\n\n下記URLからご都合のよい日時をご予約ください。\nhttps://timerex.net/s/m.yamada_d69e_6a17/713ec075\n\n予約が完了したら、運営側で確認できるように、このLINEに「予約完了」と送ってください。"}}]',
    updated_at = strftime('%Y-%m-%dT%H:%M:%f+09:00', 'now', '+9 hours')
WHERE name = 'SP案件CTA_案件相談希望';

-- 6) Create/update self-report automations.
UPDATE automations
SET description = 'TimeRex予約後にユーザーが「予約完了」と送ったら予約済みにする',
    event_type = 'message_received',
    conditions = '{"keyword":"予約完了"}',
    actions = '[{"type":"add_tag","params":{"tagId":"d4d7996a-96d4-4cf5-b819-9017f0b2a67b"}},{"type":"remove_tag","params":{"tagId":"51653388-9f63-47c4-a7b0-133e06592878"}},{"type":"remove_tag","params":{"tagId":"400e8237-7b6d-4d4d-bc27-ad4f5389fb72"}},{"type":"send_message","params":{"messageType":"text","content":"予約完了のご連絡ありがとうございます。\n\n運営側でも確認できるようになりました。当日は、予約完了メールに記載のGoogle Meet URLからご参加ください。\n\nご都合が変わった場合は、このLINEで「日程変更」と送ってください。"}}]',
    is_active = 1,
    priority = 50,
    updated_at = strftime('%Y-%m-%dT%H:%M:%f+09:00', 'now', '+9 hours'),
    line_account_id = '7da71306-4602-421c-95fb-306ff6936c09'
WHERE name = 'SP_TimeRex_予約完了_自己申告';

INSERT INTO automations (id, name, description, event_type, conditions, actions, is_active, priority, created_at, updated_at, line_account_id)
SELECT 'auto_timerex_booking_done_self_report_20260618',
       'SP_TimeRex_予約完了_自己申告',
       'TimeRex予約後にユーザーが「予約完了」と送ったら予約済みにする',
       'message_received',
       '{"keyword":"予約完了"}',
       '[{"type":"add_tag","params":{"tagId":"d4d7996a-96d4-4cf5-b819-9017f0b2a67b"}},{"type":"remove_tag","params":{"tagId":"51653388-9f63-47c4-a7b0-133e06592878"}},{"type":"remove_tag","params":{"tagId":"400e8237-7b6d-4d4d-bc27-ad4f5389fb72"}},{"type":"send_message","params":{"messageType":"text","content":"予約完了のご連絡ありがとうございます。\n\n運営側でも確認できるようになりました。当日は、予約完了メールに記載のGoogle Meet URLからご参加ください。\n\nご都合が変わった場合は、このLINEで「日程変更」と送ってください。"}}]',
       1,
       50,
       strftime('%Y-%m-%dT%H:%M:%f+09:00', 'now', '+9 hours'),
       strftime('%Y-%m-%dT%H:%M:%f+09:00', 'now', '+9 hours'),
       '7da71306-4602-421c-95fb-306ff6936c09'
WHERE NOT EXISTS (SELECT 1 FROM automations WHERE name = 'SP_TimeRex_予約完了_自己申告');

UPDATE automations
SET description = 'ユーザーが日程変更と送ったら再調整タグを付け、TimeRex再予約導線を案内する',
    event_type = 'message_received',
    conditions = '{"keyword":"日程変更"}',
    actions = '[{"type":"add_tag","params":{"tagId":"7c66e4f9-fb41-4ffb-ad5b-7cd18e85a0a4"}},{"type":"send_message","params":{"messageType":"text","content":"日程変更のご連絡ありがとうございます。\n\n予約完了メール内の変更・キャンセルリンクから変更できます。うまくいかない場合は、下記URLから再度ご都合のよい日時をご予約ください。\n\nhttps://timerex.net/s/m.yamada_d69e_6a17/713ec075\n\n再予約が完了したら、このLINEに「予約完了」と送ってください。"}}]',
    is_active = 1,
    priority = 45,
    updated_at = strftime('%Y-%m-%dT%H:%M:%f+09:00', 'now', '+9 hours'),
    line_account_id = '7da71306-4602-421c-95fb-306ff6936c09'
WHERE name = 'SP_TimeRex_日程変更';

INSERT INTO automations (id, name, description, event_type, conditions, actions, is_active, priority, created_at, updated_at, line_account_id)
SELECT 'auto_timerex_reschedule_20260618',
       'SP_TimeRex_日程変更',
       'ユーザーが日程変更と送ったら再調整タグを付け、TimeRex再予約導線を案内する',
       'message_received',
       '{"keyword":"日程変更"}',
       '[{"type":"add_tag","params":{"tagId":"7c66e4f9-fb41-4ffb-ad5b-7cd18e85a0a4"}},{"type":"send_message","params":{"messageType":"text","content":"日程変更のご連絡ありがとうございます。\n\n予約完了メール内の変更・キャンセルリンクから変更できます。うまくいかない場合は、下記URLから再度ご都合のよい日時をご予約ください。\n\nhttps://timerex.net/s/m.yamada_d69e_6a17/713ec075\n\n再予約が完了したら、このLINEに「予約完了」と送ってください。"}}]',
       1,
       45,
       strftime('%Y-%m-%dT%H:%M:%f+09:00', 'now', '+9 hours'),
       strftime('%Y-%m-%dT%H:%M:%f+09:00', 'now', '+9 hours'),
       '7da71306-4602-421c-95fb-306ff6936c09'
WHERE NOT EXISTS (SELECT 1 FROM automations WHERE name = 'SP_TimeRex_日程変更');

-- 7) Replace unused but stale template copy to prevent future reuse of manual scheduling text.
UPDATE templates
SET message_type = 'text',
    message_content = 'ご相談ありがとうございます。

無料オンライン面談は下記URLからご予約ください。
https://timerex.net/s/m.yamada_d69e_6a17/713ec075

予約が完了したら、運営側で確認できるように、このLINEに「予約完了」と送ってください。
まず質問だけしたい場合は、このままLINEにご記入ください。',
    updated_at = strftime('%Y-%m-%dT%H:%M:%f+09:00', 'now', '+9 hours')
WHERE id = 'bb20dd5a-5c12-4dc8-b537-709802373109';
