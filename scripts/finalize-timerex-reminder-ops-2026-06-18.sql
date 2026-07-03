UPDATE automations
SET actions = '[{"type":"add_tag","params":{"tagId":"d4d7996a-96d4-4cf5-b819-9017f0b2a67b"}},{"type":"remove_tag","params":{"tagId":"51653388-9f63-47c4-a7b0-133e06592878"}},{"type":"remove_tag","params":{"tagId":"400e8237-7b6d-4d4d-bc27-ad4f5389fb72"}},{"type":"send_message","params":{"messageType":"text","content":"予約完了のご連絡ありがとうございます。\n\n運営側でも確認できるようになりました。\n当日は、予約完了メールに記載のGoogle Meet URLからご参加ください。\n\n前日確認や変更・キャンセルの案内は、TimeRexから届くメールもあわせてご確認ください。\nご都合が変わった場合は、このLINEで「日程変更」と送ってください。"}}]',
    updated_at = strftime('%Y-%m-%dT%H:%M:%f+09:00', 'now', '+9 hours')
WHERE name = 'SP_TimeRex_予約完了_自己申告'
  AND line_account_id = '7da71306-4602-421c-95fb-306ff6936c09';
