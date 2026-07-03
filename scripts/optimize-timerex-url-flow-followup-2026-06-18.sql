UPDATE auto_replies
SET response_type = 'text',
    response_content = 'ありがとうございます。

案件の詳しい内容や進め方は、無料オンライン面談で確認できます。
下記URLからご都合のよい日時をご予約ください。

https://timerex.net/s/m.yamada_d69e_6a17/713ec075

予約が完了したら、運営側で確認できるように、このLINEに「予約完了」と送ってください。'
WHERE keyword = 'interest=case_digest'
  AND is_active = 1;

UPDATE scenario_steps
SET message_content = replace(
      replace(
        message_content,
        '▶ 設計スキルで副業月+¥80,000 — まずは無料面談で話を聞いてみませんか？',
        '▶ まずは無料面談で確認できます。予約後はLINEに「予約完了」と送ってください。'
      ),
      '"action": {"type": "message", "label": "飴田さんに相談してみる", "text": "飴田さんに相談したい"}',
      '"action": {"type": "uri", "label": "無料面談を予約する", "uri": "https://timerex.net/s/m.yamada_d69e_6a17/713ec075"}'
    )
WHERE id = '54b26f39-c6de-487a-873e-bbe563ba2106';
