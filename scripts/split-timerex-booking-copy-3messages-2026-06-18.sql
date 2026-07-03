-- Structure Partners: split TimeRex booking guidance into three LINE messages.

UPDATE auto_replies
SET response_content = '無料面談はこちらから予約できます👇
https://timerex.net/s/m.yamada_d69e_6a17/713ec075

予約フォームの「コメント」に
次のコードを入力してください。

{{line_split}}
{{timerex_booking_code}}

{{line_split}}
予約できたら、このLINEに
「予約完了」
と送ってください。'
WHERE keyword IN ('menu_schedule', '面談', '予約', '無料面談')
  AND response_type = 'text'
  AND instr(response_content, 'timerex.net/s/m.yamada_d69e_6a17/713ec075') > 0;

UPDATE automations
SET actions = '[{"type":"add_tag","params":{"tagId":"6b381edb-8f56-4eca-b83f-282480ee231a"}},{"type":"add_tag","params":{"tagId":"7c00fa01-65c0-4b0d-b5a2-2ee27487147a"}},{"type":"add_tag","params":{"tagId":"51653388-9f63-47c4-a7b0-133e06592878"}},{"type":"add_tag","params":{"tagId":"400e8237-7b6d-4d4d-bc27-ad4f5389fb72"}},{"type":"send_message","params":{"messageType":"text","content":"ありがとうございます！副業案件の相談ですね😊\n\n今のスキルや稼働時間に合う案件があるか、無料面談で一緒に確認できます。\n\n予約はこちら👇\nhttps://timerex.net/s/m.yamada_d69e_6a17/713ec075\n\n予約フォームの「コメント」に\n次のコードを入力してください。"}},{"type":"send_message","params":{"messageType":"text","content":"{{timerex_booking_code}}"}},{"type":"send_message","params":{"messageType":"text","content":"予約できたら、このLINEに\n「予約完了」\nと送ってください。\n\n先にLINEで聞きたいことがあれば、このまま送ってください。"}}]',
    updated_at = strftime('%Y-%m-%dT%H:%M:%f+09:00', 'now', '+9 hours')
WHERE id = '5f72ad018f9ca32eb6e4dcad5cc7c52b';

UPDATE automations
SET actions = '[{"type":"add_tag","params":{"tagId":"6b381edb-8f56-4eca-b83f-282480ee231a"}},{"type":"add_tag","params":{"tagId":"d2180db6-a8fc-479a-b280-61b156d26a36"}},{"type":"add_tag","params":{"tagId":"51653388-9f63-47c4-a7b0-133e06592878"}},{"type":"add_tag","params":{"tagId":"400e8237-7b6d-4d4d-bc27-ad4f5389fb72"}},{"type":"send_message","params":{"messageType":"text","content":"ありがとうございます！継続案件の相談ですね😊\n\n今の体制や希望条件に合う案件があるか、無料面談で一緒に確認できます。\n\n予約はこちら👇\nhttps://timerex.net/s/m.yamada_d69e_6a17/713ec075\n\n予約フォームの「コメント」に\n次のコードを入力してください。"}},{"type":"send_message","params":{"messageType":"text","content":"{{timerex_booking_code}}"}},{"type":"send_message","params":{"messageType":"text","content":"予約できたら、このLINEに\n「予約完了」\nと送ってください。\n\n先にLINEで聞きたいことがあれば、このまま送ってください。"}}]',
    updated_at = strftime('%Y-%m-%dT%H:%M:%f+09:00', 'now', '+9 hours')
WHERE id = 'df4c253545a8f867be4b11e38a01064f';

UPDATE automations
SET actions = '[{"type":"add_tag","params":{"tagId":"6b381edb-8f56-4eca-b83f-282480ee231a"}},{"type":"add_tag","params":{"tagId":"51653388-9f63-47c4-a7b0-133e06592878"}},{"type":"add_tag","params":{"tagId":"400e8237-7b6d-4d4d-bc27-ad4f5389fb72"}},{"type":"send_message","params":{"messageType":"text","content":"ありがとうございます！無料面談ですね😊\n\n合いそうな案件や進め方を、30分で一緒に確認できます。\n\n予約はこちら👇\nhttps://timerex.net/s/m.yamada_d69e_6a17/713ec075\n\n予約フォームの「コメント」に\n次のコードを入力してください。"}},{"type":"send_message","params":{"messageType":"text","content":"{{timerex_booking_code}}"}},{"type":"send_message","params":{"messageType":"text","content":"予約できたら、このLINEに\n「予約完了」\nと送ってください。\n\n先にLINEで聞きたいことがあれば、このまま送ってください。"}}]',
    updated_at = strftime('%Y-%m-%dT%H:%M:%f+09:00', 'now', '+9 hours')
WHERE id = 'fa2a507ad798a4cb9b741fb3dc25a5cb';

UPDATE automations
SET actions = '[{"type":"add_tag","params":{"tagId":"6b381edb-8f56-4eca-b83f-282480ee231a"}},{"type":"add_tag","params":{"tagId":"d2180db6-a8fc-479a-b280-61b156d26a36"}},{"type":"add_tag","params":{"tagId":"51653388-9f63-47c4-a7b0-133e06592878"}},{"type":"add_tag","params":{"tagId":"400e8237-7b6d-4d4d-bc27-ad4f5389fb72"}},{"type":"send_message","params":{"messageType":"text","content":"ありがとうございます！案件相談ですね😊\n\n合いそうな案件や無理のない進め方を、無料面談で一緒に確認できます。\n\n予約はこちら👇\nhttps://timerex.net/s/m.yamada_d69e_6a17/713ec075\n\n予約フォームの「コメント」に\n次のコードを入力してください。"}},{"type":"send_message","params":{"messageType":"text","content":"{{timerex_booking_code}}"}},{"type":"send_message","params":{"messageType":"text","content":"予約できたら、このLINEに\n「予約完了」\nと送ってください。\n\n先にLINEで聞きたいことがあれば、このまま送ってください。"}}]',
    updated_at = strftime('%Y-%m-%dT%H:%M:%f+09:00', 'now', '+9 hours')
WHERE id = '5da7cc211d1b0e362a815a3083b813a4';

UPDATE automations
SET actions = '[{"type":"add_tag","params":{"tagId":"7c66e4f9-fb41-4ffb-ad5b-7cd18e85a0a4"}},{"type":"send_message","params":{"messageType":"text","content":"日程変更ですね。\n\n変更・再予約はこちらからお願いします👇\nhttps://timerex.net/s/m.yamada_d69e_6a17/713ec075\n\n予約フォームの「コメント」に\n次のコードを入力してください。"}},{"type":"send_message","params":{"messageType":"text","content":"{{timerex_booking_code}}"}},{"type":"send_message","params":{"messageType":"text","content":"再予約できたら、このLINEに\n「予約完了」\nと送ってください。"}}]',
    updated_at = strftime('%Y-%m-%dT%H:%M:%f+09:00', 'now', '+9 hours')
WHERE id = 'auto_timerex_reschedule_20260618';
