-- Structure Partners: add per-friend LINE booking code instructions to TimeRex booking flows.

UPDATE auto_replies
SET response_content = REPLACE(
  response_content,
  'https://timerex.net/s/m.yamada_d69e_6a17/713ec075',
  'https://timerex.net/s/m.yamada_d69e_6a17/713ec075

予約フォームの「LINE確認コード」欄に、下記コードを入力してください。
LINE確認コード：{{timerex_booking_code}}
このコードで予約とLINEがつながり、前日/当日のリマインドをLINEに送れます。
欄が見当たらない場合は、備考欄かお名前の後ろにコードを入れてください。'
)
WHERE response_type = 'text'
  AND instr(response_content, 'https://timerex.net/s/m.yamada_d69e_6a17/713ec075') > 0
  AND instr(response_content, '{{timerex_booking_code}}') = 0;

UPDATE scenario_steps
SET message_content = REPLACE(
  message_content,
  'https://timerex.net/s/m.yamada_d69e_6a17/713ec075',
  'https://timerex.net/s/m.yamada_d69e_6a17/713ec075

予約フォームの「LINE確認コード」欄に、下記コードを入力してください。
LINE確認コード：{{timerex_booking_code}}
このコードで予約とLINEがつながり、前日/当日のリマインドをLINEに送れます。
欄が見当たらない場合は、備考欄かお名前の後ろにコードを入れてください。'
)
WHERE instr(message_content, 'https://timerex.net/s/m.yamada_d69e_6a17/713ec075') > 0
  AND instr(message_content, '{{timerex_booking_code}}') = 0;

UPDATE templates
SET message_content = REPLACE(
  message_content,
  'https://timerex.net/s/m.yamada_d69e_6a17/713ec075',
  'https://timerex.net/s/m.yamada_d69e_6a17/713ec075

予約フォームの「LINE確認コード」欄に、下記コードを入力してください。
LINE確認コード：{{timerex_booking_code}}
このコードで予約とLINEがつながり、前日/当日のリマインドをLINEに送れます。
欄が見当たらない場合は、備考欄かお名前の後ろにコードを入れてください。'
),
updated_at = strftime('%Y-%m-%dT%H:%M:%f+09:00', 'now', '+9 hours')
WHERE message_type = 'text'
  AND instr(message_content, 'https://timerex.net/s/m.yamada_d69e_6a17/713ec075') > 0
  AND instr(message_content, '{{timerex_booking_code}}') = 0;

UPDATE automations
SET actions = '[{"type":"add_tag","params":{"tagId":"6b381edb-8f56-4eca-b83f-282480ee231a"}},{"type":"add_tag","params":{"tagId":"7c00fa01-65c0-4b0d-b5a2-2ee27487147a"}},{"type":"add_tag","params":{"tagId":"51653388-9f63-47c4-a7b0-133e06592878"}},{"type":"add_tag","params":{"tagId":"400e8237-7b6d-4d4d-bc27-ad4f5389fb72"}},{"type":"send_message","params":{"messageType":"text","content":"ありがとうございます！副業案件、気になりますよね😊\n\n無料オンライン面談では、いまのご状況をもとに\n・本業と両立できそうか\n・スキルや得意領域に合う案件があるか\n・無理のない稼働時間や報酬感\nを一緒に整理できます。\n\n「応募する前に、自分に合うかだけ確認したい」くらいでも大丈夫です。\nご都合のよい日時をこちらから選んでください👇\nhttps://timerex.net/s/m.yamada_d69e_6a17/713ec075\n\n予約フォームの「LINE確認コード」欄に、下記コードを入力してください。\nLINE確認コード：{{timerex_booking_code}}\nこのコードで予約とLINEがつながり、前日/当日のリマインドをLINEに送れます。\n欄が見当たらない場合は、備考欄かお名前の後ろにコードを入れてください。\n\n予約が完了したら、運営側でも確認しやすいように、このLINEに「予約完了」と送ってください。\n\n面談の前にLINEで確認したいことがあれば、このままメッセージでも大丈夫です。"}}]',
    updated_at = strftime('%Y-%m-%dT%H:%M:%f+09:00', 'now', '+9 hours')
WHERE id = '5f72ad018f9ca32eb6e4dcad5cc7c52b';

UPDATE automations
SET actions = '[{"type":"add_tag","params":{"tagId":"6b381edb-8f56-4eca-b83f-282480ee231a"}},{"type":"add_tag","params":{"tagId":"d2180db6-a8fc-479a-b280-61b156d26a36"}},{"type":"add_tag","params":{"tagId":"51653388-9f63-47c4-a7b0-133e06592878"}},{"type":"add_tag","params":{"tagId":"400e8237-7b6d-4d4d-bc27-ad4f5389fb72"}},{"type":"send_message","params":{"messageType":"text","content":"ありがとうございます！継続案件や外注パートナー相談ですね😊\n\n無料オンライン面談では、今の体制・得意領域・希望条件をもとに、無理なく受けられる案件があるかを一緒に整理できます。\n\n「すぐ受けるかは未定だけど、条件が合うか知りたい」くらいでも大丈夫です。\nご都合のよい日時をこちらから選んでください👇\nhttps://timerex.net/s/m.yamada_d69e_6a17/713ec075\n\n予約フォームの「LINE確認コード」欄に、下記コードを入力してください。\nLINE確認コード：{{timerex_booking_code}}\nこのコードで予約とLINEがつながり、前日/当日のリマインドをLINEに送れます。\n欄が見当たらない場合は、備考欄かお名前の後ろにコードを入れてください。\n\n予約が完了したら、運営側でも確認しやすいように、このLINEに「予約完了」と送ってください。\n\n面談の前にLINEで確認したいことがあれば、このままメッセージでも大丈夫です。"}}]',
    updated_at = strftime('%Y-%m-%dT%H:%M:%f+09:00', 'now', '+9 hours')
WHERE id = 'df4c253545a8f867be4b11e38a01064f';

UPDATE automations
SET actions = '[{"type":"add_tag","params":{"tagId":"6b381edb-8f56-4eca-b83f-282480ee231a"}},{"type":"add_tag","params":{"tagId":"51653388-9f63-47c4-a7b0-133e06592878"}},{"type":"add_tag","params":{"tagId":"400e8237-7b6d-4d4d-bc27-ad4f5389fb72"}},{"type":"send_message","params":{"messageType":"text","content":"ありがとうございます！無料面談ですね😊\n\n面談では、今のスキル・稼働時間・希望条件をもとに、合いそうな案件があるかを一緒に確認できます。\n売り込みではなく、まずは「自分に合うか」を整理する時間として使ってください。\n\nご都合のよい日時をこちらから選んでください👇\nhttps://timerex.net/s/m.yamada_d69e_6a17/713ec075\n\n予約フォームの「LINE確認コード」欄に、下記コードを入力してください。\nLINE確認コード：{{timerex_booking_code}}\nこのコードで予約とLINEがつながり、前日/当日のリマインドをLINEに送れます。\n欄が見当たらない場合は、備考欄かお名前の後ろにコードを入れてください。\n\n予約が完了したら、運営側でも確認しやすいように、このLINEに「予約完了」と送ってください。\n\n面談の前にLINEで確認したいことがあれば、このままメッセージでも大丈夫です。"}}]',
    updated_at = strftime('%Y-%m-%dT%H:%M:%f+09:00', 'now', '+9 hours')
WHERE id = 'fa2a507ad798a4cb9b741fb3dc25a5cb';

UPDATE automations
SET actions = '[{"type":"add_tag","params":{"tagId":"6b381edb-8f56-4eca-b83f-282480ee231a"}},{"type":"add_tag","params":{"tagId":"d2180db6-a8fc-479a-b280-61b156d26a36"}},{"type":"add_tag","params":{"tagId":"51653388-9f63-47c4-a7b0-133e06592878"}},{"type":"add_tag","params":{"tagId":"400e8237-7b6d-4d4d-bc27-ad4f5389fb72"}},{"type":"send_message","params":{"messageType":"text","content":"ありがとうございます！案件相談ですね😊\n\n無料オンライン面談では、今の体制や得意領域を伺いながら、合いそうな案件や無理のない進め方を一緒に確認できます。\n\nまだ具体的に決まっていなくても大丈夫です。まずは整理するつもりでご利用ください。\nご都合のよい日時をこちらから選んでください👇\nhttps://timerex.net/s/m.yamada_d69e_6a17/713ec075\n\n予約フォームの「LINE確認コード」欄に、下記コードを入力してください。\nLINE確認コード：{{timerex_booking_code}}\nこのコードで予約とLINEがつながり、前日/当日のリマインドをLINEに送れます。\n欄が見当たらない場合は、備考欄かお名前の後ろにコードを入れてください。\n\n予約が完了したら、運営側でも確認しやすいように、このLINEに「予約完了」と送ってください。\n\n面談の前にLINEで確認したいことがあれば、このままメッセージでも大丈夫です。"}}]',
    updated_at = strftime('%Y-%m-%dT%H:%M:%f+09:00', 'now', '+9 hours')
WHERE id = '5da7cc211d1b0e362a815a3083b813a4';

UPDATE automations
SET actions = '[{"type":"add_tag","params":{"tagId":"7c66e4f9-fb41-4ffb-ad5b-7cd18e85a0a4"}},{"type":"send_message","params":{"messageType":"text","content":"日程変更のご連絡ありがとうございます。\n\n予約完了メール内の変更・キャンセルリンクから変更できます。うまくいかない場合は、下記URLから再度ご都合のよい日時をご予約ください。\n\nhttps://timerex.net/s/m.yamada_d69e_6a17/713ec075\n\n予約フォームの「LINE確認コード」欄に、下記コードを入力してください。\nLINE確認コード：{{timerex_booking_code}}\nこのコードで予約とLINEがつながり、再予約後のリマインドをLINEに送れます。\n欄が見当たらない場合は、備考欄かお名前の後ろにコードを入れてください。\n\n再予約が完了したら、このLINEに「予約完了」と送ってください。"}}]',
    updated_at = strftime('%Y-%m-%dT%H:%M:%f+09:00', 'now', '+9 hours')
WHERE id = 'auto_timerex_reschedule_20260618';
