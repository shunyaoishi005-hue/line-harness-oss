// テスト友だちのタグ確認・削除（Q1分岐の実機テスト準備用）
//
// Usage:
//   node scripts/manage-test-friend-tags-2026-08.mjs <friendId>                 # タグ一覧表示
//   node scripts/manage-test-friend-tags-2026-08.mjs <friendId> --remove <タグ名> [--remove <タグ名>...]
//
// APIキーはリポジトリ直下 .env の LINE_HARNESS_API_KEY を自動読み込み。

import { readFileSync } from 'node:fs';
try {
  for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch { /* .env が無ければ環境変数のみで動く */ }

const API_URL = process.env.LINE_HARNESS_BASE_URL ?? 'https://line-harness.shunyaoishi-line.workers.dev';
const API_KEY = process.env.LINE_HARNESS_API_KEY;
if (!API_KEY) {
  console.error('LINE_HARNESS_API_KEY is required');
  process.exit(1);
}

const args = process.argv.slice(2);
const friendId = args[0];
if (!friendId || friendId.startsWith('--')) {
  console.error('Usage: node scripts/manage-test-friend-tags-2026-08.mjs <friendId> [--remove <タグ名>]...');
  process.exit(1);
}
const removeNames = [];
for (let i = 1; i < args.length; i++) {
  if (args[i] === '--remove' && args[i + 1]) removeNames.push(args[++i]);
}

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
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok || json.success === false) {
    throw new Error(`${method} ${path} failed (${res.status}): ${json.error ?? json.raw ?? res.statusText}`);
  }
  return json.data;
}

const friend = await api('GET', `/api/friends/${friendId}`);
console.log(`friend: ${friend.displayName ?? '(no name)'} (${friend.id}) following=${friend.isFollowing}`);
const tags = friend.tags ?? (await api('GET', `/api/friends/${friendId}/tags`).catch(() => []));
console.log('tags:');
for (const t of tags) console.log(`  - ${t.name} (${t.id})`);

for (const name of removeNames) {
  const tag = tags.find((t) => t.name === name);
  if (!tag) { console.log(`[skip] タグ「${name}」は付与されていません`); continue; }
  await api('DELETE', `/api/friends/${friendId}/tags/${tag.id}`);
  console.log(`[removed] ${name} (${tag.id})`);
}

// シナリオenroll状況も表示（再フォローで再開されるか判断用）
const enrollments = await api('GET', `/api/friends/${friendId}/scenarios`).catch(() => null);
if (enrollments) {
  console.log('scenarios:');
  for (const e of enrollments) console.log(`  - ${e.scenarioId} status=${e.status} step=${e.currentStepOrder}`);
}
