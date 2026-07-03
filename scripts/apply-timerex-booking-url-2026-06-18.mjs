// Structure Partners LINE Harness: apply TimeRex booking URL to auto-replies.
//
// Usage:
//   $env:LH_API_KEY='...'
//   node scripts/apply-timerex-booking-url-2026-06-18.mjs --dry-run
//   node scripts/apply-timerex-booking-url-2026-06-18.mjs
//
// Optional env:
//   LINE_HARNESS_API_URL     default: https://line-harness.shunyaoishi-line.workers.dev
//   LINE_HARNESS_ACCOUNT_ID  target a specific line_accounts.id
//   TIMEREX_BOOKING_URL      override the booking URL

const API_URL = process.env.LINE_HARNESS_API_URL ?? 'https://line-harness.shunyaoishi-line.workers.dev';
const API_KEY = process.env.LH_API_KEY;
const TARGET_ACCOUNT_ID = process.env.LINE_HARNESS_ACCOUNT_ID ?? null;
const TIMEREX_BOOKING_URL =
  process.env.TIMEREX_BOOKING_URL ?? 'https://timerex.net/s/m.yamada_d69e_6a17/713ec075';
const DRY_RUN = process.argv.includes('--dry-run');

if (!API_KEY) {
  console.error('LH_API_KEY environment variable is required.');
  process.exit(1);
}

const bookingMessage = `無料オンライン面談はこちらからご予約ください。

空いている日時を選ぶだけで予約が完了します。
予約完了後、Google MeetのURLがメールで届きます。

${TIMEREX_BOOKING_URL}`;

const rules = [
  { keyword: 'menu_schedule', matchType: 'exact' },
  { keyword: '面談', matchType: 'contains' },
  { keyword: '予約', matchType: 'contains' },
  { keyword: '無料面談', matchType: 'contains' },
  { keyword: '無料面談を希望', matchType: 'exact' },
];

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
    const found = accounts.find((account) => account.id === TARGET_ACCOUNT_ID);
    if (!found) {
      throw new Error(`LINE_HARNESS_ACCOUNT_ID not found: ${TARGET_ACCOUNT_ID}`);
    }
    return found;
  }

  const active = accounts.find((account) => account.isActive !== false) ?? accounts[0];
  if (!active) {
    throw new Error('No line accounts found.');
  }
  return active;
}

function findExisting(autoReplies, keyword, accountId) {
  const matches = autoReplies.filter((item) => item.keyword === keyword);
  return (
    matches.find((item) => item.lineAccountId === accountId) ??
    matches.find((item) => item.lineAccountId === null) ??
    null
  );
}

async function upsertAutoReply(rule, accountId) {
  const autoReplies = await api('GET', `/api/auto-replies?accountId=${encodeURIComponent(accountId)}`);
  const existing = findExisting(autoReplies, rule.keyword, accountId);
  const payload = {
    keyword: rule.keyword,
    matchType: rule.matchType,
    responseType: 'text',
    responseContent: bookingMessage,
    lineAccountId: existing?.lineAccountId ?? accountId,
    isActive: true,
  };

  if (existing) {
    console.log(`[update] ${rule.keyword} (${existing.id})`);
    if (!DRY_RUN) {
      await api('PUT', `/api/auto-replies/${existing.id}`, payload);
    }
    return;
  }

  console.log(`[create] ${rule.keyword}`);
  if (!DRY_RUN) {
    await api('POST', '/api/auto-replies', payload);
  }
}

console.log('=== Apply TimeRex booking URL to LINE Harness ===');
console.log(`API_URL: ${API_URL}`);
console.log(`TimeRex: ${TIMEREX_BOOKING_URL}`);
console.log(`Mode: ${DRY_RUN ? 'dry-run' : 'apply'}`);

const accounts = await api('GET', '/api/line-accounts');
const account = pickAccount(accounts);
console.log(`Target account: ${account.name ?? '(no name)'} (${account.id})`);

for (const rule of rules) {
  await upsertAutoReply(rule, account.id);
}

console.log('Done.');
