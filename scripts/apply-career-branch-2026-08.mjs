// Structure Partners LINE Harness: Q1分岐（キャリア探索/キャリア面談ルート）反映スクリプト
//
// 設計図: LINE_Q1分岐_詳細設計図_2026-08-01.md（ストラクチュア様）
// 構成は scripts/apply-timerex-booking-url-2026-06-18.mjs を踏襲。
// name / keyword / stepOrder 一致で upsert する冪等スクリプト（再実行しても重複作成しない）。
//
// Usage:
//   $env:LINE_HARNESS_API_KEY='...'   # .env 経由で渡すこと（引数直書き禁止）
//   node scripts/apply-career-branch-2026-08.mjs --dry-run   # 差分確認のみ
//   node scripts/apply-career-branch-2026-08.mjs --print     # 生成Flex/文面のダンプ
//   node scripts/apply-career-branch-2026-08.mjs             # 本番反映
//
// Optional env:
//   LINE_HARNESS_BASE_URL         default: https://line-harness.shunyaoishi-line.workers.dev
//   LINE_HARNESS_LINE_ACCOUNT_ID  default: 7da71306-...（apply-line-diagnosis-v1.mjs と同じ）
//   TIMEREX_BOOKING_URL           override（未指定時は既存 auto_replies から現行値を抽出）
//
// 設計図からの実装上の逸脱（理由付き）:
//   1. ②の送信キーワードを「診断Q1:キャリア面談」→「診断Q1:先輩のリアル」に変更。
//      既存 auto_replies に contains ルール「面談」「予約」(2026-06-18作成) が現存し、
//      auto_reply は created_at ASC の first-match なので新ルールでは勝てないため。
//   2. 面談ルートの先輩選択Flexは scenario step1 ではなく A-02 automation の
//      send_message で即時返信する（cron 5分間隔では設計の「即時」を満たせないため）。
//      これに伴い面談ルートの steps は story/FAQ/リマインド/週1合流の4stepとなる。
//   3. A-11〜14 の予約案内本文は auto_replies 側 (reply=無料・即時) で返し、
//      automation はタグ付与のみ（両方で送ると二重送信になるため）。
//   4. A-15 は作らない（探索:先輩に聞く は auto_reply が直接Flexで応答するため）。
//   5. 面談ルート step5 / 探索F4 の「週1配信へ合流」は、ハーネス上メッセージ無し
//      stepが作れないため、軽い案内文 + on_reach_tag_id(合流タグ) で実装。
//   6. F2 の選択肢マップは図版未確定のためテキスト先行（設計図§11どおり）。

// リポジトリ直下の .env を自動読み込み（シークレットをコマンドラインに書かないため）
import { readFileSync } from 'node:fs';
try {
  for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch { /* .env が無ければ環境変数のみで動く */ }

const API_URL = process.env.LINE_HARNESS_BASE_URL ?? process.env.LINE_HARNESS_API_URL
  ?? 'https://line-harness.shunyaoishi-line.workers.dev';
const API_KEY = process.env.LINE_HARNESS_API_KEY ?? process.env.LH_API_KEY;
const TARGET_ACCOUNT_ID = process.env.LINE_HARNESS_LINE_ACCOUNT_ID ?? process.env.LINE_HARNESS_ACCOUNT_ID
  ?? '7da71306-4602-421c-95fb-306ff6936c09'; // apply-line-diagnosis-v1.mjs と同じ既定アカウント
const DRY_RUN = process.argv.includes('--dry-run');
const PRINT = process.argv.includes('--print');
const FORCE = process.argv.includes('--force');

if (!API_KEY && !PRINT) {
  console.error('LINE_HARNESS_API_KEY environment variable is required.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 定数（キーワード・タグ名・シナリオ名）
// ---------------------------------------------------------------------------

const SCENARIO_DIAGNOSIS_ID = '935dcdb9-361b-4e94-adca-ef1439325dc0'; // SP_初回診断_v1
const SCENARIO_MENTOR_NAME = 'SP_診断後_キャリア面談ルート_v1';
const SCENARIO_EXPLORE_NAME = 'SP_診断後_キャリア探索ルート_v1';
const BOOKED_TAG_NAME = '面談予約済み';
const BOOKED_TAG_FALLBACK_ID = 'd4d7996a-96d4-4cf5-b819-9017f0b2a67b';
const WEEKLY_TAG_CANDIDATES = ['合流:週1配信', '週1配信', '定期配信', '配信:週1'];
const WEEKLY_TAG_NAME = '合流:週1配信';

const K = {
  q1Explore: '診断Q1:キャリア探索',
  q1Mentor: '診断Q1:先輩のリアル', // 設計図では 診断Q1:キャリア面談（逸脱1参照）
  q2Career: '探索Q2:キャリア全般',
  q2Income: '探索Q2:収入',
  q2Indep: '探索Q2:独立',
  q2Style: '探索Q2:働き方',
  q3Money: '探索Q3:収入リアル',
  q3Start: '探索Q3:始め方',
  q3Balance: '探索Q3:両立',
  q3Fail: '探索Q3:失敗談',
  mentorIndep: 'キャリアQ2:独立設計士',
  mentorSide: 'キャリアQ2:副業設計士',
  mentorRemote: 'キャリアQ2:リモート設計士',
  mentorOps: 'キャリアQ2:運営',
  askMentor: '探索:先輩に聞く',
};

const NEW_KEYWORDS = Object.values(K);

const TAGS = {
  purposeExplore: '目的:キャリア探索',
  purposeMentor: '目的:キャリア面談',
  worryCareer: '悩み:キャリア全般',
  worryIncome: '悩み:収入',
  worryIndep: '悩み:独立',
  worryStyle: '悩み:働き方',
  wantMoney: '知りたい:収入リアル',
  wantStart: '知りたい:始め方',
  wantBalance: '知りたい:両立',
  wantFail: '知りたい:失敗談',
  interestIndep: '関心:独立設計士の話',
  interestSide: '関心:副業設計士の話',
  interestRemote: '関心:リモート設計士の話',
  interestOps: '関心:運営の話',
};

const TAG_COLORS = {
  '目的:': '#C85D30',
  '悩み:': '#8A7F73',
  '知りたい:': '#2B2520',
  '関心:': '#B08968',
};

// ---------------------------------------------------------------------------
// Flex ビルダー（ブランドカラー: ベージュ #EAE4D8 / コーラル #C85D30 / 濃茶 #2B2520）
// ---------------------------------------------------------------------------

const C = {
  accent: '#C85D30',
  text: '#2B2520',
  sub: '#8A7F73',
  sep: '#EAE4D8',
  rowBg: '#FDF6EF',
};

/** 2行タップ領域（box） */
function row2(main, sub, keyword, label) {
  return {
    type: 'box', layout: 'vertical', spacing: 'xs', paddingAll: '12px',
    backgroundColor: C.rowBg, cornerRadius: '8px',
    action: { type: 'message', label, text: keyword },
    contents: [
      { type: 'text', text: main, size: 'md', weight: 'bold', color: C.text, wrap: true },
      { type: 'text', text: sub, size: 'xs', color: C.sub, wrap: true },
    ],
  };
}

/** 1行タップ領域（box） */
function row1(main, keyword, label) {
  return {
    type: 'box', layout: 'vertical', paddingAll: '12px',
    backgroundColor: C.rowBg, cornerRadius: '8px',
    action: { type: 'message', label, text: keyword },
    contents: [
      { type: 'text', text: main, size: 'md', weight: 'bold', color: C.text, wrap: true },
    ],
  };
}

/** secondaryボタン（label 20字以内であること） */
function btn(label, keyword) {
  return {
    type: 'button', style: 'secondary', height: 'sm',
    action: { type: 'message', label, text: keyword },
  };
}

function bubble({ eyebrow, title, body, items }) {
  const contents = [];
  if (eyebrow) contents.push({ type: 'text', text: eyebrow, size: 'xs', color: C.accent, weight: 'bold' });
  if (title) contents.push({ type: 'text', text: title, size: 'lg', weight: 'bold', color: C.text, wrap: true });
  if (body) contents.push({ type: 'text', text: body, size: 'sm', color: C.text, wrap: true });
  contents.push({ type: 'separator', color: C.sep });
  contents.push(...items);
  return {
    type: 'bubble',
    body: { type: 'box', layout: 'vertical', spacing: 'md', contents },
  };
}

/** Q1 5択カード（step1 / step2 リマインドで title/body 差し替え） */
function q1Card({ title, body }) {
  return bubble({
    eyebrow: 'あなたに合わせてご案内します',
    title,
    body,
    items: [
      row2('🧭 これからのキャリアを考えたい', 'まずは選択肢を知るところから', K.q1Explore, 'career1'),
      row2('👂 先輩設計士のリアルを聞いてみたい', '独立・副業・リモートの先輩と30分話せます', K.q1Mentor, 'career2'),
      btn('💼 副業で案件を受けたい', '診断Q1:副業'),
      btn('🏠 フリーランス案件を増やす', '診断Q1:独立'),
      btn('👀 まず情報収集したい', '診断Q1:情報収集'),
    ],
  });
}

const FLEX_Q1_STEP1 = q1Card({
  title: 'いま、いちばん近いのはどれですか？',
  body: 'ご登録ありがとうございます！選んだ内容に合わせて、キャリアの情報や案件例をお届けします（30秒で完了）',
});

const FLEX_Q1_REMIND = q1Card({
  title: '30秒だけ、教えてください',
  body: 'いま気になっていることに合わせて、キャリアの情報や案件例・報酬目安をお届けします。いちばん近いものを選ぶだけでOKです👇',
});

/** 探索Q2カード（body 差し替え可: F1再掲用） */
function q2Card(body) {
  return bubble({
    eyebrow: 'あなたのこと、教えてください',
    title: 'いま一番気になっているのは、どれに近いですか？',
    body,
    items: [
      row1('🏢 このまま今の会社でいいのかな', K.q2Career, 'q2-1'),
      row1('💰 収入をもう少し増やしたい', K.q2Income, 'q2-2'),
      row1('🚀 いつか独立したいけど道筋が見えない', K.q2Indep, 'q2-3'),
      row1('🌍 場所にしばられない働き方がしたい', K.q2Style, 'q2-4'),
    ],
  });
}

const FLEX_Q2 = q2Card('近いものでOKです');
const FLEX_Q2_F1 = q2Card('昨日の質問、30秒で終わります。いま気になっていることに近いものを選ぶだけでOKです👇');

const FLEX_Q3 = bubble({
  title: 'ちなみに、いちばん知りたいのはどれですか？',
  items: [
    row1('💴 実際、どのくらい稼げるのか', K.q3Money, 'q3-1'),
    row1('🐣 みんな最初の一歩をどう踏み出したのか', K.q3Start, 'q3-2'),
    row1('⚖️ 本業と両立できるのか', K.q3Balance, 'q3-3'),
    row1('🧗 大変だったこと・失敗談', K.q3Fail, 'q3-4'),
  ],
});

/** 先輩選択カード（面談ルート即時版 / 探索ブリッジ版） */
function mentorCard({ eyebrow, title, body }) {
  return bubble({
    eyebrow, title, body,
    items: [
      row1('独立1年目のリアルを話せる設計士', K.mentorIndep, 'm-1'),
      row1('副業で月15万稼ぐ会社員設計士', K.mentorSide, 'm-2'),
      row1('海外からフルリモートで働く設計士', K.mentorRemote, 'm-3'),
      row1('ストラクチュア運営メンバー', K.mentorOps, 'm-4'),
    ],
  });
}

const FLEX_MENTOR_DIRECT = mentorCard({
  eyebrow: '先輩設計士のリアル',
  title: '誰の話を聞いてみたいですか？',
  body: 'ぴったりの相手をご紹介します。気になる先輩を選んでください。',
});

const FLEX_MENTOR_BRIDGE = mentorCard({
  title: '誰のリアルなら聞いてみたいですか？',
});

// ---------------------------------------------------------------------------
// 文面（TimeRex URL は実行時に解決して差し込む）
// ---------------------------------------------------------------------------

const URL_PLACEHOLDER = '{TIMEREX_URL}';

/**
 * LPの先輩実例（ロールモデル）セクションへの参考リンク。
 * #about は運営会社セクションのため誤り。ロールモデル5名は #rewards セクション内。
 * LP側に id="role-models" アンカーを追加デプロイしたら '#role-models' に差し替えること。
 */
const LP_ABOUT_URL = 'https://structure-partners.jp/#rewards';

/**
 * 予約案内（4パターン共通フォーマット）
 * 1通目: 予約URLを主動線に（実例を見たい人向けにLPリンクを補足）
 * 2通目({{line_split}}以降): 「予約完了」自己申告の案内。受け側は既存の
 * SP_TimeRex_予約完了_自己申告 automation（contains一致・全ルート共通）。
 * ※予約コード({{timerex_booking_code}})はキャリア2ルートでは使わない（2026-08-01決定）
 */
function bookingText(personalized) {
  return `ありがとうございます！
${personalized}

▼ 先輩と話せる30分（オンライン）
・売り込みは一切ありません
・カメラオフ参加OK
・聞きたいことが漠然としていても大丈夫です

ご都合のいい時間をこちらから選んでください👇
${URL_PLACEHOLDER}

予約の前に先輩たちの実例を見たい方はこちら👇
${LP_ABOUT_URL}
{{line_split}}
予約できたら、このLINEに
「予約完了」
と送ってください。`;
}

const BOOKING_TEXTS = {
  [K.mentorIndep]: bookingText('独立1年目のリアル（収入の変化・案件の取り方・不安だったこと）を、実際に歩んでいる先輩＋運営がお話しします。'),
  [K.mentorSide]: bookingText('会社員を続けながら副業で月15万を稼ぐ働き方のリアルを、実践している先輩＋運営がお話しします。'),
  [K.mentorRemote]: bookingText('場所にしばられない働き方のリアル（案件の進め方・必要な準備）を、実践している先輩＋運営がお話しします。'),
  [K.mentorOps]: bookingText('設計士のキャリアの選択肢を、運営メンバーがフラットな立場で一緒に整理します。'),
};

/** 探索Q2 共感文（auto_reply 側で返す） */
const EMPATHY_TEXTS = {
  [K.q2Career]: 'その感覚、20代の設計士の方からいちばんよく聞きます。',
  [K.q2Income]: '設計の仕事、業務量のわりに給与が見合わない…とよく聞きます。',
  [K.q2Indep]: '「いつかは独立したい、でも道筋が見えない」——ここで止まる方が一番多いです。',
  [K.q2Style]: '設計の仕事は本来、場所を選ばないはずですよね。',
};

/** 探索Q3 ブリッジ文（auto_reply 側で返す・共通） */
const BRIDGE_TEXT = `わかります、そこが一番気になりますよね。

実はそれ、記事や求人票にはほとんど載っていない部分なんです。
一番早いのは、実際にやっている先輩に直接聞くこと。

ストラクチュアパートナーズには、
少し先を歩いている先輩設計士がいます。

実際のメンバー例はこちら👇
${LP_ABOUT_URL}`;

/** 面談ルート step: 先輩ストーリー（仮文面。まさし提供の実話に差し替え予定） */
const STORY_TEXT = `【先輩のリアル】20代で登録したAさんの場合

会社員として設計の仕事をしながら、
まずは副業で月3万円の案件からスタート。
半年後には月15万円、いまは独立して1年目です。

「最初の一歩は、話を聞くだけでした」

Aさんと同じスタート地点から始められます。
気になる先輩との30分はこちらから👇
${URL_PLACEHOLDER}`;

const FAQ_TEXT = `よくいただく3つの質問にお答えします。

Q. 何を話せばいいですか？
A. 決めてこなくて大丈夫です。いまの状況を話すだけで、頭の整理になります。

Q. 勧誘されませんか？
A. されません。コミュニティのご案内はしますが、その場での決断は求めません。

Q. 経験が浅くても大丈夫？
A. 20代・実務経験2〜3年で参加している方も多いです。

▼ 先輩と話せる30分
${URL_PLACEHOLDER}`;

const MENTOR_REMIND_TEXT = `先日ご案内した先輩との30分、まだ枠があります。
予約はいつでも大丈夫です。タイミングが合うときにどうぞ👇
${URL_PLACEHOLDER}`;

/** 週1配信へ合流する最終step（メッセージ必須のため軽い案内文＋合流タグ付与） */
const WEEKLY_MERGE_TEXT = `これからは、設計士のキャリアに役立つ情報を週1回ペースでお届けします。

先輩と話せる30分は、いつでもこちらから予約できます👇
${URL_PLACEHOLDER}`;

/** 探索F2: 選択肢マップ（図版未確定のためテキスト先行）＋ボタン */
const FLEX_F2 = bubble({
  eyebrow: 'キャリアの選択肢マップ',
  title: '設計士の働き方、ざっくり4パターン',
  body: `🏢 会社員のまま設計を極める
💼 会社員 × 副業で収入の柱を増やす
🚀 独立・フリーランスで裁量を持って働く
🌍 リモートで場所にしばられず働く

気になる働き方があれば、実際にやっている先輩に直接聞けます👇`,
  items: [btn('先輩に直接聞いてみる', K.askMentor)],
});

/** 探索F3: 先輩ストーリー（素材が揃うまで共通1本）＋ボタン */
const FLEX_F3 = bubble({
  eyebrow: '先輩のリアル',
  title: '20代で登録したAさんの場合',
  body: `会社員として設計の仕事をしながら、まずは副業で月3万円の案件からスタート。半年後には月15万円、いまは独立して1年目です。

「最初の一歩は、話を聞くだけでした」

Aさんと同じスタート地点から始められます。`,
  items: [btn('先輩に直接聞いてみる', K.askMentor)],
});

const F4_TEXT = `予約はいつでも大丈夫です。気が向いたときにどうぞ👇
${URL_PLACEHOLDER}`;

// ---------------------------------------------------------------------------
// APIヘルパー（apply-timerex-booking-url-2026-06-18.mjs と同形）
// ---------------------------------------------------------------------------

async function api(method, path, body) {
  const headers = { Authorization: `Bearer ${API_KEY}` };
  const options = { method, headers };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const res = await fetch(`${API_URL}${path}`, options);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok || json.success === false) {
    const detail = json.error ?? json.raw ?? res.statusText;
    throw new Error(`${method} ${path} failed (${res.status}): ${detail}`);
  }
  return json.data;
}

function pickAccount(accounts) {
  if (TARGET_ACCOUNT_ID) {
    const found = accounts.find((a) => a.id === TARGET_ACCOUNT_ID);
    if (!found) throw new Error(`LINE_HARNESS_ACCOUNT_ID not found: ${TARGET_ACCOUNT_ID}`);
    return found;
  }
  const active = accounts.find((a) => a.isActive !== false) ?? accounts[0];
  if (!active) throw new Error('No line accounts found.');
  return active;
}

// ---------------------------------------------------------------------------
// --print モード: 生成物のダンプのみ（API不要）
// ---------------------------------------------------------------------------

if (PRINT) {
  const dump = {
    FLEX_Q1_STEP1, FLEX_Q1_REMIND, FLEX_Q2, FLEX_Q2_F1, FLEX_Q3,
    FLEX_MENTOR_DIRECT, FLEX_MENTOR_BRIDGE, FLEX_F2, FLEX_F3,
    BOOKING_TEXTS, EMPATHY_TEXTS, BRIDGE_TEXT, STORY_TEXT, FAQ_TEXT,
    MENTOR_REMIND_TEXT, WEEKLY_MERGE_TEXT, F4_TEXT,
  };
  console.log(JSON.stringify(dump, null, 2));
  process.exit(0);
}

// ---------------------------------------------------------------------------
// メイン
// ---------------------------------------------------------------------------

console.log('=== Apply Q1 career branch (2026-08) to LINE Harness ===');
console.log(`API_URL: ${API_URL}`);
console.log(`Mode: ${DRY_RUN ? 'dry-run' : 'apply'}`);

const accounts = await api('GET', '/api/line-accounts');
const account = pickAccount(accounts);
console.log(`Target account: ${account.name ?? '(no name)'} (${account.id})`);

// --- 1. 既存データ取得 -------------------------------------------------------

const [allTags, allAutoReplies, allAutomations] = await Promise.all([
  api('GET', '/api/tags'),
  api('GET', `/api/auto-replies?accountId=${encodeURIComponent(account.id)}`),
  api('GET', `/api/automations?lineAccountId=${encodeURIComponent(account.id)}`),
]);

// --- 2. 事前確認: キーワード衝突チェック（設計図§9-2） ------------------------

// ボタン押下で送られるテキスト（=新キーワードそのもの）が、既に存在する
// auto_reply ルールに横取りされないか。auto_reply は created_at ASC の
// first-match なので、既存ルールのキーワードが新テキストに含まれていたらアウト。
const conflicts = [];
for (const text of NEW_KEYWORDS) {
  for (const rule of allAutoReplies) {
    if (!rule.isActive) continue;
    if (NEW_KEYWORDS.includes(rule.keyword)) continue; // 自分自身のupsert対象
    const hit = rule.matchType === 'exact' ? text === rule.keyword : text.includes(rule.keyword);
    if (hit) conflicts.push(`text "${text}" は既存 auto_reply "${rule.keyword}" (${rule.matchType}, ${rule.id}) に先に一致します`);
  }
}
if (conflicts.length > 0) {
  console.error('\n!!! キーワード衝突を検出しました。設計図§9-2に従い反映を中止します。');
  for (const c2 of conflicts) console.error('  - ' + c2);
  if (!FORCE) process.exit(1);
  console.error('--force 指定のため続行します。');
}

// 既存 automation の keyword 条件との交差は警告のみ（二重発火の可能性を確認する）
for (const a of allAutomations) {
  if (!a.isActive || a.eventType !== 'message_received') continue;
  const kw = a.conditions?.keyword ?? a.conditions?.keyword_exact;
  if (!kw) continue;
  if (a.name.startsWith('SP_Q1分岐_')) continue; // 本スクリプトの管理対象
  for (const text of NEW_KEYWORDS) {
    if (text.includes(kw)) {
      console.warn(`[warn] 既存 automation "${a.name}" (keyword=${kw}) が新テキスト "${text}" にも発火します`);
    }
  }
}
console.log('キーワード衝突チェック: OK');

// --- 3. TimeRex URL / 面談予約済みタグの解決 ---------------------------------

let timerexUrl = process.env.TIMEREX_BOOKING_URL ?? null;
if (!timerexUrl) {
  for (const kw of ['面談', 'menu_schedule', '予約', '無料面談']) {
    const rule = allAutoReplies.find((r) => r.keyword === kw && r.isActive);
    const m = rule?.responseContent?.match(/https:\/\/timerex\.net\/\S+/);
    if (m) { timerexUrl = m[0]; break; }
  }
}
if (!timerexUrl) throw new Error('TimeRex URL を既存 auto_replies から特定できませんでした。TIMEREX_BOOKING_URL を指定してください。');
console.log(`TimeRex URL: ${timerexUrl}`);

const fill = (s) => s.replaceAll(URL_PLACEHOLDER, timerexUrl);

const bookedTag = allTags.find((t) => t.name === BOOKED_TAG_NAME)
  ?? allTags.find((t) => t.id === BOOKED_TAG_FALLBACK_ID);
if (!bookedTag) throw new Error(`面談予約済みタグが見つかりません（name=${BOOKED_TAG_NAME}）`);
console.log(`面談予約済みタグ: ${bookedTag.name} (${bookedTag.id})`);

// 既存Q1（apply-line-diagnosis-v1.mjs）と同じ運用に合わせるための既存タグ解決。
// 診断:開始 = Q1回答済みマーカー／目的:* は排他付与（exclusiveAdd）。
const diagStartTag = allTags.find((t) => t.name === '診断:開始') ?? null;
if (!diagStartTag) console.warn('[warn] タグ「診断:開始」が見つかりません。A-01/A-02 での付与をスキップします');
const existingGoalTagIds = ['目的:副業案件', '目的:独立相談', '目的:独立済み・事業者', '目的:情報収集']
  .map((n) => allTags.find((t) => t.name === n))
  .filter(Boolean)
  .map((t) => t.id);

// --- 4. タグ upsert（14種 + 週1合流タグ） ------------------------------------

const tagIds = {}; // name -> id
async function ensureTag(name) {
  const existing = allTags.find((t) => t.name === name);
  if (existing) {
    console.log(`[tag skip] ${name} (${existing.id})`);
    tagIds[name] = existing.id;
    return existing.id;
  }
  const prefix = Object.keys(TAG_COLORS).find((p) => name.startsWith(p));
  console.log(`[tag create] ${name}`);
  if (DRY_RUN) { tagIds[name] = `(dry-run:${name})`; return tagIds[name]; }
  const created = await api('POST', '/api/tags', { name, color: prefix ? TAG_COLORS[prefix] : '#C85D30' });
  tagIds[name] = created.id;
  return created.id;
}

for (const name of Object.values(TAGS)) await ensureTag(name);

let weeklyTag = WEEKLY_TAG_CANDIDATES
  .map((n) => allTags.find((t) => t.name === n))
  .find(Boolean);
if (weeklyTag) {
  console.log(`[tag skip] 週1合流タグは既存を流用: ${weeklyTag.name} (${weeklyTag.id})`);
  tagIds[weeklyTag.name] = weeklyTag.id;
} else {
  await ensureTag(WEEKLY_TAG_NAME);
  weeklyTag = { name: WEEKLY_TAG_NAME, id: tagIds[WEEKLY_TAG_NAME] };
}

// --- 5. シナリオ + steps upsert ----------------------------------------------

const scenarioList = await api('GET', `/api/scenarios?lineAccountId=${encodeURIComponent(account.id)}`);

async function ensureScenario(name, description) {
  const existing = scenarioList.find((s) => s.name === name);
  if (existing) {
    console.log(`[scenario skip] ${name} (${existing.id})`);
    return existing.id;
  }
  console.log(`[scenario create] ${name}`);
  if (DRY_RUN) return `(dry-run:${name})`;
  const created = await api('POST', '/api/scenarios', {
    name,
    description,
    triggerType: 'manual',
    lineAccountId: account.id,
    deliveryMode: 'relative',
  });
  return created.id;
}

async function upsertSteps(scenarioId, steps) {
  if (DRY_RUN && String(scenarioId).startsWith('(dry-run')) {
    for (const s of steps) console.log(`[step plan] order=${s.stepOrder} delay=${s.delayMinutes} type=${s.messageType}`);
    return;
  }
  const detail = await api('GET', `/api/scenarios/${scenarioId}`);
  for (const s of steps) {
    const existing = detail.steps.find((e) => e.stepOrder === s.stepOrder);
    if (existing) {
      console.log(`[step update] ${detail.name} order=${s.stepOrder}`);
      if (!DRY_RUN) await api('PUT', `/api/scenarios/${scenarioId}/steps/${existing.id}`, s);
    } else {
      console.log(`[step create] ${detail.name} order=${s.stepOrder}`);
      if (!DRY_RUN) await api('POST', `/api/scenarios/${scenarioId}/steps`, s);
    }
  }
  const extra = detail.steps.filter((e) => !steps.some((s) => s.stepOrder === e.stepOrder));
  for (const e of extra) console.warn(`[warn] ${detail.name} に管理外の step order=${e.stepOrder} が存在します（削除はしません）`);
}

// 面談ルート（先輩選択は A-02 automation が即時送信するため steps は翌日以降のフォロー）
const mentorScenarioId = await ensureScenario(
  SCENARIO_MENTOR_NAME,
  'Q1②先輩のリアル選択後のフォロー。先輩選択FlexはA-02 automationが即時返信。',
);
await upsertSteps(mentorScenarioId, [
  { stepOrder: 1, delayMinutes: 1440, messageType: 'text', messageContent: fill(STORY_TEXT) },
  { stepOrder: 2, delayMinutes: 2880, messageType: 'text', messageContent: fill(FAQ_TEXT) },
  {
    stepOrder: 3, delayMinutes: 7200, messageType: 'text', messageContent: fill(MENTOR_REMIND_TEXT),
    conditionType: 'tag_not_exists', conditionValue: bookedTag.id,
  },
  {
    stepOrder: 4, delayMinutes: 11520, messageType: 'text', messageContent: fill(WEEKLY_MERGE_TEXT),
    onReachTagId: DRY_RUN ? undefined : weeklyTag.id,
  },
]);

// 探索ルート F1〜F4
const exploreScenarioId = await ensureScenario(
  SCENARIO_EXPLORE_NAME,
  'Q1①キャリア探索選択後のフォローF1〜F4。メイン対話はauto_replies連鎖。',
);
await upsertSteps(exploreScenarioId, [
  {
    stepOrder: 1, delayMinutes: 1440, messageType: 'flex', messageContent: JSON.stringify(FLEX_Q2_F1),
    // 設計図§3-5注記: タグ複数OR判定が不可のため「悩み:キャリア全般なし」で近似（誤配信許容）
    conditionType: 'tag_not_exists', conditionValue: DRY_RUN ? '(dry-run)' : tagIds[TAGS.worryCareer],
  },
  {
    stepOrder: 2, delayMinutes: 2880, messageType: 'flex', messageContent: JSON.stringify(FLEX_F2),
    conditionType: 'tag_not_exists', conditionValue: bookedTag.id,
  },
  {
    stepOrder: 3, delayMinutes: 5760, messageType: 'flex', messageContent: JSON.stringify(FLEX_F3),
    conditionType: 'tag_not_exists', conditionValue: bookedTag.id,
  },
  {
    stepOrder: 4, delayMinutes: 11520, messageType: 'text', messageContent: fill(F4_TEXT),
    conditionType: 'tag_not_exists', conditionValue: bookedTag.id,
    onReachTagId: DRY_RUN ? undefined : weeklyTag.id,
  },
]);

// --- 6. auto_replies upsert（15種） ------------------------------------------

function findAutoReply(keyword) {
  const matches = allAutoReplies.filter((r) => r.keyword === keyword);
  return matches.find((r) => r.lineAccountId === account.id) ?? matches.find((r) => r.lineAccountId === null) ?? null;
}

async function upsertAutoReply({ keyword, responseType, responseContent }) {
  const existing = findAutoReply(keyword);
  const payload = {
    keyword,
    matchType: 'contains',
    responseType,
    responseContent: responseContent ?? '',
    lineAccountId: existing?.lineAccountId ?? account.id,
    isActive: true,
  };
  if (existing) {
    console.log(`[auto-reply update] ${keyword} (${existing.id})`);
    if (!DRY_RUN) await api('PUT', `/api/auto-replies/${existing.id}`, payload);
    return existing.id;
  }
  console.log(`[auto-reply create] ${keyword}`);
  if (DRY_RUN) return `(dry-run:${keyword})`;
  const created = await api('POST', '/api/auto-replies', payload);
  return created.id;
}

const autoReplyDefs = [
  // ①②: 応答本体は automation 側（silent で未読化・push フォールバックを抑止）
  { keyword: K.q1Explore, responseType: 'silent' },
  { keyword: K.q1Mentor, responseType: 'silent' },
  // 探索Q2: 共感文（Q3 Flex は automation が push）
  { keyword: K.q2Career, responseType: 'text', responseContent: EMPATHY_TEXTS[K.q2Career] },
  { keyword: K.q2Income, responseType: 'text', responseContent: EMPATHY_TEXTS[K.q2Income] },
  { keyword: K.q2Indep, responseType: 'text', responseContent: EMPATHY_TEXTS[K.q2Indep] },
  { keyword: K.q2Style, responseType: 'text', responseContent: EMPATHY_TEXTS[K.q2Style] },
  // 探索Q3: ブリッジ文（先輩選択 Flex は automation が push）
  { keyword: K.q3Money, responseType: 'text', responseContent: BRIDGE_TEXT },
  { keyword: K.q3Start, responseType: 'text', responseContent: BRIDGE_TEXT },
  { keyword: K.q3Balance, responseType: 'text', responseContent: BRIDGE_TEXT },
  { keyword: K.q3Fail, responseType: 'text', responseContent: BRIDGE_TEXT },
  // 先輩選択: 予約案内4パターン（automation はタグ付与のみ）
  { keyword: K.mentorIndep, responseType: 'text', responseContent: fill(BOOKING_TEXTS[K.mentorIndep]) },
  { keyword: K.mentorSide, responseType: 'text', responseContent: fill(BOOKING_TEXTS[K.mentorSide]) },
  { keyword: K.mentorRemote, responseType: 'text', responseContent: fill(BOOKING_TEXTS[K.mentorRemote]) },
  { keyword: K.mentorOps, responseType: 'text', responseContent: fill(BOOKING_TEXTS[K.mentorOps]) },
  // F2/F3 ボタン: 先輩選択 Flex を直接返す（A-15 は不要）
  { keyword: K.askMentor, responseType: 'flex', responseContent: JSON.stringify(FLEX_MENTOR_BRIDGE) },
];

const autoReplyIds = {};
for (const def of autoReplyDefs) autoReplyIds[def.keyword] = await upsertAutoReply(def);

// --- 7. automations upsert（A-01〜A-14） --------------------------------------

function act(type, params) { return { type, params }; }
const addTag = (name) => act('add_tag', { tagId: tagIds[name] });
const removeTagById = (id) => act('remove_tag', { tagId: id });
const startScenario = (id) => act('start_scenario', { scenarioId: id });
const sendFlex = (flex, altText) => act('send_message', { messageType: 'flex', content: JSON.stringify(flex), altText });

// 既存Q1と同じ「目的:* は排他付与」。既存4種 + もう一方の新タグを外してから付与する。
function exclusiveGoalActions(targetTagName, otherNewTagName) {
  const removals = [...existingGoalTagIds, tagIds[otherNewTagName]]
    .filter((id) => id && !String(id).startsWith('(dry-run'))
    .map(removeTagById);
  const marker = diagStartTag ? [act('add_tag', { tagId: diagStartTag.id })] : [];
  return [...marker, ...removals, addTag(targetTagName)];
}

async function upsertAutomation({ name, description, keyword, actions }) {
  const existing = allAutomations.find((a) => a.name === name);
  const payload = {
    name,
    description,
    eventType: 'message_received',
    conditions: { keyword },
    actions,
    priority: 20, // 既存SP診断_* automation と同じ優先度
    isActive: true,
  };
  if (existing) {
    console.log(`[automation update] ${name} (${existing.id})`);
    if (!DRY_RUN) await api('PUT', `/api/automations/${existing.id}`, payload);
    return existing.id;
  }
  console.log(`[automation create] ${name}`);
  if (DRY_RUN) return `(dry-run:${name})`;
  const created = await api('POST', '/api/automations', { ...payload, lineAccountId: account.id });
  return created.id;
}

const automationDefs = [
  {
    name: 'SP_Q1分岐_A-01_キャリア探索受付', keyword: K.q1Explore,
    description: 'Q1①: 診断:開始+目的タグ排他付与→探索ルートenroll→探索Q2 Flex送信',
    actions: [...exclusiveGoalActions(TAGS.purposeExplore, TAGS.purposeMentor), startScenario(exploreScenarioId), sendFlex(FLEX_Q2, 'いま一番気になっているのは、どれに近いですか？')],
  },
  {
    name: 'SP_Q1分岐_A-02_キャリア面談受付', keyword: K.q1Mentor,
    description: 'Q1②: 診断:開始+目的タグ排他付与→面談ルートenroll→先輩選択 Flex送信',
    actions: [...exclusiveGoalActions(TAGS.purposeMentor, TAGS.purposeExplore), startScenario(mentorScenarioId), sendFlex(FLEX_MENTOR_DIRECT, '誰の話を聞いてみたいですか？')],
  },
  { name: 'SP_Q1分岐_A-03_探索Q2_キャリア全般', keyword: K.q2Career, description: '悩みタグ付与→探索Q3 Flex送信', actions: [addTag(TAGS.worryCareer), sendFlex(FLEX_Q3, 'いちばん知りたいのはどれですか？')] },
  { name: 'SP_Q1分岐_A-04_探索Q2_収入', keyword: K.q2Income, description: '悩みタグ付与→探索Q3 Flex送信', actions: [addTag(TAGS.worryIncome), sendFlex(FLEX_Q3, 'いちばん知りたいのはどれですか？')] },
  { name: 'SP_Q1分岐_A-05_探索Q2_独立', keyword: K.q2Indep, description: '悩みタグ付与→探索Q3 Flex送信', actions: [addTag(TAGS.worryIndep), sendFlex(FLEX_Q3, 'いちばん知りたいのはどれですか？')] },
  { name: 'SP_Q1分岐_A-06_探索Q2_働き方', keyword: K.q2Style, description: '悩みタグ付与→探索Q3 Flex送信', actions: [addTag(TAGS.worryStyle), sendFlex(FLEX_Q3, 'いちばん知りたいのはどれですか？')] },
  { name: 'SP_Q1分岐_A-07_探索Q3_収入リアル', keyword: K.q3Money, description: '知りたいタグ付与→先輩選択 Flex送信', actions: [addTag(TAGS.wantMoney), sendFlex(FLEX_MENTOR_BRIDGE, '誰のリアルなら聞いてみたいですか？')] },
  { name: 'SP_Q1分岐_A-08_探索Q3_始め方', keyword: K.q3Start, description: '知りたいタグ付与→先輩選択 Flex送信', actions: [addTag(TAGS.wantStart), sendFlex(FLEX_MENTOR_BRIDGE, '誰のリアルなら聞いてみたいですか？')] },
  { name: 'SP_Q1分岐_A-09_探索Q3_両立', keyword: K.q3Balance, description: '知りたいタグ付与→先輩選択 Flex送信', actions: [addTag(TAGS.wantBalance), sendFlex(FLEX_MENTOR_BRIDGE, '誰のリアルなら聞いてみたいですか？')] },
  { name: 'SP_Q1分岐_A-10_探索Q3_失敗談', keyword: K.q3Fail, description: '知りたいタグ付与→先輩選択 Flex送信', actions: [addTag(TAGS.wantFail), sendFlex(FLEX_MENTOR_BRIDGE, '誰のリアルなら聞いてみたいですか？')] },
  // 予約案内本文は auto_reply が返す。二重送信を避けるため automation はタグ付与のみ（逸脱3）。
  { name: 'SP_Q1分岐_A-11_予約案内_独立設計士', keyword: K.mentorIndep, description: '関心タグ付与（予約案内はauto_reply側）', actions: [addTag(TAGS.interestIndep)] },
  { name: 'SP_Q1分岐_A-12_予約案内_副業設計士', keyword: K.mentorSide, description: '関心タグ付与（予約案内はauto_reply側）', actions: [addTag(TAGS.interestSide)] },
  { name: 'SP_Q1分岐_A-13_予約案内_リモート設計士', keyword: K.mentorRemote, description: '関心タグ付与（予約案内はauto_reply側）', actions: [addTag(TAGS.interestRemote)] },
  { name: 'SP_Q1分岐_A-14_予約案内_運営', keyword: K.mentorOps, description: '関心タグ付与（予約案内はauto_reply側）', actions: [addTag(TAGS.interestOps)] },
];

const automationIds = {};
for (const def of automationDefs) automationIds[def.name] = await upsertAutomation(def);

// --- 8. SP_初回診断_v1 step1/step2 を新Q1 Flexに差し替え ----------------------

const diagnosis = await api('GET', `/api/scenarios/${SCENARIO_DIAGNOSIS_ID}`);
if (diagnosis.name !== 'SP_初回診断_v1') {
  throw new Error(`シナリオ ${SCENARIO_DIAGNOSIS_ID} の name が想定と異なります: ${diagnosis.name}`);
}
const step1 = diagnosis.steps.find((s) => s.stepOrder === 1);
const step2 = diagnosis.steps.find((s) => s.stepOrder === 2);
if (!step1 || !step2) throw new Error('SP_初回診断_v1 の step1/step2 が見つかりません');

console.log(`[diagnosis update] step1 (${step1.id}) → 新Q1 Flex（5択）`);
if (!DRY_RUN) {
  await api('PUT', `/api/scenarios/${SCENARIO_DIAGNOSIS_ID}/steps/${step1.id}`, {
    messageType: 'flex', messageContent: JSON.stringify(FLEX_Q1_STEP1),
  });
}
console.log(`[diagnosis update] step2 (${step2.id}) → 新Q1リマインド Flex（5択）`);
if (!DRY_RUN) {
  await api('PUT', `/api/scenarios/${SCENARIO_DIAGNOSIS_ID}/steps/${step2.id}`, {
    messageType: 'flex', messageContent: JSON.stringify(FLEX_Q1_REMIND),
  });
}

// --- 9. サマリ（設計図末尾に追記する用） --------------------------------------

console.log('\n=== 反映結果サマリ（設計図末尾に追記してください） ===');
console.log(`- 反映日時: ${new Date().toISOString()}`);
console.log(`- 対象アカウント: ${account.name ?? ''} (${account.id})`);
console.log(`- ${SCENARIO_MENTOR_NAME}: ${mentorScenarioId}`);
console.log(`- ${SCENARIO_EXPLORE_NAME}: ${exploreScenarioId}`);
console.log(`- 週1合流タグ: ${weeklyTag.name} (${weeklyTag.id})`);
console.log(`- 面談予約済みタグ(condition_value): ${bookedTag.id}`);
console.log(`- TimeRex URL: ${timerexUrl}`);
console.log('- タグ:');
for (const [name, id] of Object.entries(tagIds)) console.log(`  - ${name}: ${id}`);
console.log('- auto_replies:');
for (const [kw, id] of Object.entries(autoReplyIds)) console.log(`  - ${kw}: ${id}`);
console.log('- automations:');
for (const [name, id] of Object.entries(automationIds)) console.log(`  - ${name}: ${id}`);
console.log('\nDone.');
