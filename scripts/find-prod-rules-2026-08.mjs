// 本番の auto_replies / automations をキーワードで横断検索する調査用ユーティリティ
// Usage: node scripts/find-prod-rules-2026-08.mjs <検索語>

import { readFileSync } from 'node:fs';
try {
  for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch { /* noop */ }

const API_URL = process.env.LINE_HARNESS_BASE_URL ?? 'https://line-harness.shunyaoishi-line.workers.dev';
const API_KEY = process.env.LINE_HARNESS_API_KEY;
const term = process.argv[2];
if (!API_KEY || !term) {
  console.error('Usage: LINE_HARNESS_API_KEY=... node scripts/find-prod-rules-2026-08.mjs <検索語>');
  process.exit(1);
}

async function api(path) {
  const res = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${API_KEY}` } });
  const json = await res.json();
  if (!res.ok || json.success === false) throw new Error(`GET ${path} failed (${res.status})`);
  return json.data;
}

const [autoReplies, automations] = await Promise.all([
  api('/api/auto-replies'),
  api('/api/automations'),
]);

console.log(`--- auto_replies matching "${term}" ---`);
for (const r of autoReplies) {
  if (r.keyword.includes(term) || (r.responseContent ?? '').includes(term)) {
    console.log(`[${r.isActive ? 'active' : 'inactive'}] keyword=${r.keyword} match=${r.matchType} type=${r.responseType} id=${r.id}`);
    console.log(`  content: ${(r.responseContent ?? '').slice(0, 200).replace(/\n/g, '\\n')}`);
  }
}
console.log(`--- automations matching "${term}" ---`);
for (const a of automations) {
  const condStr = JSON.stringify(a.conditions);
  const actStr = JSON.stringify(a.actions);
  if (a.name.includes(term) || condStr.includes(term) || actStr.includes(term)) {
    console.log(`[${a.isActive ? 'active' : 'inactive'}] name=${a.name} event=${a.eventType} priority=${a.priority} id=${a.id}`);
    console.log(`  conditions: ${condStr}`);
    console.log(`  actions: ${actStr.slice(0, 300)}`);
  }
}
