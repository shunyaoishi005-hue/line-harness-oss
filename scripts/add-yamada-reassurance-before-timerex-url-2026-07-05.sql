-- Structure: add reassurance copy before TimeRex booking URL.
-- Scope: booking guidance only. Does not change URL, booking code, tags, or split-message structure.

UPDATE auto_replies
SET response_content = replace(
  response_content,
  char(10) || char(10) || 'https://timerex.net/s/m.yamada_d69e_6a17/713ec075',
  char(10) || char(10) || '面談はすべて代表の山田が直接対応します。
無理な勧誘ではなく、今のご状況に合う案件があるかを一緒に確認する時間です。' || char(10) || char(10) || 'https://timerex.net/s/m.yamada_d69e_6a17/713ec075'
)
WHERE is_active = 1
  AND instr(response_content, 'https://timerex.net/s/m.yamada_d69e_6a17/713ec075') > 0
  AND instr(response_content, '面談はすべて代表の山田が直接対応します。') = 0;

UPDATE automations
SET actions = replace(
  actions,
  '\r\n\r\nhttps://timerex.net/s/m.yamada_d69e_6a17/713ec075',
  '\r\n\r\n面談はすべて代表の山田が直接対応します。\r\n無理な勧誘ではなく、今のご状況に合う案件があるかを一緒に確認する時間です。\r\n\r\nhttps://timerex.net/s/m.yamada_d69e_6a17/713ec075'
)
WHERE is_active = 1
  AND id != 'auto_timerex_reschedule_20260618'
  AND instr(actions, 'https://timerex.net/s/m.yamada_d69e_6a17/713ec075') > 0
  AND instr(actions, '面談はすべて代表の山田が直接対応します。') = 0;

UPDATE automations
SET actions = replace(
  actions,
  '\n\nhttps://timerex.net/s/m.yamada_d69e_6a17/713ec075',
  '\n\n面談はすべて代表の山田が直接対応します。\n無理な勧誘ではなく、今のご状況に合う案件があるかを一緒に確認する時間です。\n\nhttps://timerex.net/s/m.yamada_d69e_6a17/713ec075'
)
WHERE is_active = 1
  AND id != 'auto_timerex_reschedule_20260618'
  AND instr(actions, 'https://timerex.net/s/m.yamada_d69e_6a17/713ec075') > 0
  AND instr(actions, '面談はすべて代表の山田が直接対応します。') = 0;

UPDATE scenario_steps
SET message_content = replace(
  message_content,
  char(10) || char(10) || 'https://timerex.net/s/m.yamada_d69e_6a17/713ec075',
  char(10) || char(10) || '面談はすべて代表の山田が直接対応します。
無理な勧誘ではなく、今のご状況に合う案件があるかを一緒に確認する時間です。' || char(10) || char(10) || 'https://timerex.net/s/m.yamada_d69e_6a17/713ec075'
)
WHERE instr(message_content, 'https://timerex.net/s/m.yamada_d69e_6a17/713ec075') > 0
  AND instr(message_content, '面談はすべて代表の山田が直接対応します。') = 0;
