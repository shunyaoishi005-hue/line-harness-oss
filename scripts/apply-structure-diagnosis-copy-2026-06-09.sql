-- Q1: keep the intro short and remove unnecessary thanks.
UPDATE scenario_steps
SET message_content = replace(
  message_content,
  '登録ありがとうございます。いくつか質問に答えると、副業・フリーランス・法人など、あなたの状況に合う案件例と報酬目安をお送りします。まずは今の目的に一番近いものを選んでください。',
  '回答後に、あなたに合う案件例と報酬目安をお送りします。まず目的を選んでください。'
)
WHERE instr(message_content, '登録ありがとうございます。いくつか質問に答えると') > 0;

UPDATE auto_replies
SET response_content = replace(
  response_content,
  '追加ありがとうございます。あなたに近い案件をお送りするために、今の状況に一番近いものを選んでください。回答後に、案件例・報酬目安・次に見るべき情報をお送りします。',
  '回答後に、あなたに合う案件例と報酬目安をお送りします。まず目的を選んでください。'
)
WHERE instr(response_content, '追加ありがとうございます。あなたに近い案件') > 0;

UPDATE scenario_steps
SET message_content = replace(
  message_content,
  '回答は30秒ほどで終わります。あとから変更しても大丈夫です。',
  '30秒ほどで終わります。あとから変更できます。'
)
WHERE instr(message_content, '回答は30秒ほどで終わります。あとから変更しても大丈夫です。') > 0;

UPDATE auto_replies
SET response_content = replace(
  response_content,
  '回答は30秒ほどで終わります。あとから変更しても大丈夫です。',
  '30秒ほどで終わります。あとから変更できます。'
)
WHERE instr(response_content, '回答は30秒ほどで終わります。あとから変更しても大丈夫です。') > 0;

-- Q1/Q4: shorten labels so they fit on LINE buttons.
UPDATE scenario_steps
SET message_content = replace(
  message_content,
  'フリーランス・法人として案件を増やしたい',
  'フリーランス案件を増やす'
)
WHERE instr(message_content, 'フリーランス・法人として案件を増やしたい') > 0;

UPDATE auto_replies
SET response_content = replace(
  response_content,
  'フリーランス・法人として案件を増やしたい',
  'フリーランス案件を増やす'
)
WHERE instr(response_content, 'フリーランス・法人として案件を増やしたい') > 0;

UPDATE auto_replies
SET response_content = replace(
  response_content,
  'フリーランス・法人向けの案件例を見たい',
  'フリーランス案件を見たい'
)
WHERE instr(response_content, 'フリーランス・法人向けの案件例を見たい') > 0;

-- Q4 immediate replies: remove thanks and align wording to freelance.
UPDATE auto_replies
SET response_content = '副業で相談しやすい案件例をお送りします。気になる案件があれば「この案件を相談する」を押してください。'
WHERE keyword = '診断Q4:副業案件';

UPDATE auto_replies
SET response_content = 'フリーランス向けの案件例をお送りします。気になる案件があれば「この案件を相談する」を押してください。'
WHERE keyword IN ('診断Q4:事業者相談', '診断Q4:独立相談');

-- Downstream route/carousel wording: use freelance only.
UPDATE automations
SET actions = replace(actions, 'フリーランス・法人向け案件例', 'フリーランス向け案件例')
WHERE instr(actions, 'フリーランス・法人向け案件例') > 0;

UPDATE automations
SET actions = replace(actions, 'フリーランス・法人向け', 'フリーランス向け')
WHERE instr(actions, 'フリーランス・法人向け') > 0;

UPDATE scenario_steps
SET message_content = replace(message_content, 'フリーランス・法人向け', 'フリーランス向け')
WHERE instr(message_content, 'フリーランス・法人向け') > 0;

UPDATE scenario_steps
SET message_content = replace(message_content, 'フリーランス・個人事業主・法人として活動されている方', 'フリーランスとして活動されている方')
WHERE instr(message_content, 'フリーランス・個人事業主・法人として活動されている方') > 0;

UPDATE scenario_steps
SET message_content = replace(message_content, 'すでに独立・事業化されている方', 'フリーランスとして活動している方')
WHERE instr(message_content, 'すでに独立・事業化されている方') > 0;

UPDATE scenarios
SET name = 'SP_診断後_フリーランスルート_v1'
WHERE name = 'SP_診断後_独立済み事業者ルート_v1';

UPDATE automations
SET name = replace(name, '事業者相談', 'フリーランス案件')
WHERE instr(name, 'SP診断_Q4_事業者相談') > 0;

UPDATE automations
SET name = replace(name, '独立相談', 'フリーランス相談')
WHERE instr(name, 'SP診断_Q4_独立相談') > 0;
