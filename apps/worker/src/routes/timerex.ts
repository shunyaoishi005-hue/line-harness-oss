import { Hono } from 'hono';
import { jstNow } from '@line-crm/db';
import type { Env } from '../index.js';
import {
  cancelTimerexRemindersForBooking,
  computeTimerexReminders,
  insertTimerexRemindersForBooking,
} from '../services/timerex-reminders.js';
import {
  extractTimerexBookingCode,
  findFriendByTimerexBookingCode,
  markTimerexBookingCodeUsed,
} from '../services/timerex-booking-codes.js';

const timerex = new Hono<Env>();

type TimerexStatus = 'booked' | 'cancelled' | 'unknown';

interface TimerexConfigRow {
  id: string;
  name: string;
  line_account_id: string;
  notify_webhook_url: string | null;
}

interface ExtractedTimerexBooking {
  externalId: string;
  eventType: string | null;
  status: TimerexStatus;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  bookingCode: string | null;
  startsAt: string | null;
  endsAt: string | null;
  meetUrl: string | null;
}

interface FriendMatch {
  friendId: string | null;
  matchedBy: string | null;
}

const BOOKED_TAG_NAME = '面談予約済み';
const PENDING_TAG_NAMES = ['面談:予約希望', '面談希望（日程未確定）'];
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/;
const URL_RE = /https?:\/\/[^\s"'<>]+/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function flattenPayload(value: unknown, prefix = ''): Array<{ path: string; value: string }> {
  const out: Array<{ path: string; value: string }> = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => out.push(...flattenPayload(item, `${prefix}[${index}]`)));
    return out;
  }
  if (isPlainObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${key}` : key;
      out.push(...flattenPayload(child, path));
    }
    return out;
  }
  if (value !== null && value !== undefined) {
    out.push({ path: prefix, value: String(value) });
  }
  return out;
}

function parseIso(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString();
}

function firstByPath(
  flat: Array<{ path: string; value: string }>,
  predicate: (path: string, value: string) => boolean,
): string | null {
  const found = flat.find(({ path, value }) => predicate(path.toLowerCase(), value));
  return found?.value ?? null;
}

function firstDateByPath(
  flat: Array<{ path: string; value: string }>,
  predicate: (path: string) => boolean,
): string | null {
  for (const { path, value } of flat) {
    if (!predicate(path.toLowerCase())) continue;
    const iso = parseIso(value);
    if (iso) return iso;
  }
  return null;
}

function asString(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map((item) => asString(item)).filter(Boolean).join(', ');
  return null;
}

function getObject(value: unknown, key: string): Record<string, unknown> | null {
  if (!isPlainObject(value)) return null;
  const child = value[key];
  return isPlainObject(child) ? child : null;
}

function getString(value: unknown, key: string): string | null {
  if (!isPlainObject(value)) return null;
  return asString(value[key]);
}

function getTimerexFormValue(payload: unknown, fieldTypes: string[]): string | null {
  const event = getObject(payload, 'event');
  const form = event?.form;
  if (!Array.isArray(form)) return null;
  const wanted = new Set(fieldTypes);
  for (const item of form) {
    if (!isPlainObject(item)) continue;
    const fieldType = asString(item.field_type);
    if (fieldType && wanted.has(fieldType)) {
      const value = asString(item.value);
      if (value && value.trim()) return value.trim();
    }
  }
  return null;
}

function getTimerexEventString(payload: unknown, key: string): string | null {
  return getString(getObject(payload, 'event'), key);
}

function extractOfficialMeetUrl(payload: unknown): string | null {
  const event = getObject(payload, 'event');
  if (!event) return null;

  const candidates = [
    getString(getObject(event, 'google_meet'), 'join_url'),
    getString(getObject(event, 'google_meet'), 'url'),
    getString(getObject(event, 'google_meet'), 'meeting_url'),
    getString(getObject(event, 'zoom_meeting'), 'join_url'),
    getString(getObject(event, 'teams_meeting'), 'join_url'),
    getString(getObject(event, 'online_meeting'), 'join_url'),
    getString(getObject(event, 'online_meeting'), 'url'),
  ];

  for (const candidate of candidates) {
    const match = candidate?.match(URL_RE)?.[0];
    if (match) return match;
  }
  return null;
}

async function payloadHash(raw: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function detectStatus(eventType: string | null, startsAt: string | null): TimerexStatus {
  const value = (eventType ?? '').toLowerCase();
  if (/(cancel|canceled|cancelled|delete|deleted)/.test(value)) return 'cancelled';
  if (/(confirm|confirmed|book|booking|reserve|reserved|schedule|scheduled|complete|completed|fixed|created)/.test(value)) {
    return 'booked';
  }
  return startsAt ? 'booked' : 'unknown';
}

export async function extractTimerexBooking(payload: unknown, raw: string): Promise<ExtractedTimerexBooking> {
  const flat = flattenPayload(payload);
  const bookingCode = extractTimerexBookingCode(flat.map(({ value }) => value));

  const eventType =
    getString(payload, 'webhook_type') ??
    firstByPath(flat, (path) =>
      /(^|\.)(webhook_type|event|event_type|type|status|action)$/.test(path),
    );

  const externalId =
    getTimerexEventString(payload, 'id') ??
    firstByPath(flat, (path) =>
      /(booking|schedule|reservation|appointment|calendar|event).*(^|\.|_)(id|uuid)$/.test(path) ||
      /(^|\.)(booking_id|reservation_id|appointment_id|schedule_id|event_id|uuid)$/.test(path),
    ) ??
    firstByPath(flat, (path) => /(^|\.)id$/.test(path)) ??
    `payload_${await payloadHash(raw)}`;

  const startsAt =
    parseIso(getTimerexEventString(payload, 'local_start_datetime')) ??
    parseIso(getTimerexEventString(payload, 'start_datetime')) ??
    firstDateByPath(flat, (path) =>
      /(start|starts_at|start_at|start_time|started_at|from)/.test(path) &&
      !/(created|updated|cancel|deadline)/.test(path),
    );
  const endsAt =
    parseIso(getTimerexEventString(payload, 'local_end_datetime')) ??
    parseIso(getTimerexEventString(payload, 'end_datetime')) ??
    firstDateByPath(flat, (path) =>
      /(end|ends_at|end_at|end_time|finished_at|to)/.test(path) &&
      !/(created|updated|cancel|deadline)/.test(path),
    );

  const guestEmail =
    getTimerexFormValue(payload, ['guest_email', 'email'])?.match(EMAIL_RE)?.[0].toLowerCase() ??
    firstByPath(flat, (_path, value) => EMAIL_RE.test(value))?.match(EMAIL_RE)?.[0].toLowerCase() ??
    null;
  const guestPhone =
    getTimerexFormValue(payload, ['guest_phone', 'phone', 'tel', 'mobile'])?.match(PHONE_RE)?.[0] ??
    firstByPath(flat, (path, value) =>
      /(phone|tel|mobile)/.test(path) && PHONE_RE.test(value),
    )?.match(PHONE_RE)?.[0] ??
    null;
  const guestName =
    getTimerexFormValue(payload, ['guest_name', 'name', 'full_name']) ??
    firstByPath(flat, (path, value) => {
      if (!value || value.length > 80 || EMAIL_RE.test(value) || URL_RE.test(value)) return false;
      return /(guest|invitee|customer|attendee|member|user|participant).*(name|full_name)/.test(path);
    });
  const meetUrl =
    extractOfficialMeetUrl(payload) ??
    firstByPath(flat, (_path, value) => {
      const match = value.match(URL_RE);
      if (!match) return false;
      return /(meet\.google\.com|zoom\.us|teams\.microsoft\.com)/i.test(match[0]);
    })?.match(URL_RE)?.[0] ??
    null;

  return {
    externalId,
    eventType,
    status: detectStatus(eventType, startsAt),
    guestName,
    guestEmail,
    guestPhone,
    bookingCode,
    startsAt,
    endsAt,
    meetUrl,
  };
}

async function uniqueFriendMatch(
  db: D1Database,
  sql: string,
  binds: unknown[],
  matchedBy: string,
): Promise<FriendMatch> {
  const rows = await db.prepare(sql).bind(...binds).all<{ id: string }>();
  const uniqueIds = Array.from(new Set((rows.results ?? []).map((r) => r.id)));
  if (uniqueIds.length === 1) return { friendId: uniqueIds[0], matchedBy };
  return { friendId: null, matchedBy: null };
}

async function matchFriend(
  db: D1Database,
  lineAccountId: string,
  booking: Pick<ExtractedTimerexBooking, 'bookingCode' | 'guestEmail' | 'guestName' | 'guestPhone'>,
): Promise<FriendMatch> {
  if (booking.bookingCode) {
    const friendId = await findFriendByTimerexBookingCode(db, lineAccountId, booking.bookingCode);
    if (friendId) return { friendId, matchedBy: 'timerex_booking_code' };
  }

  if (booking.guestEmail) {
    const email = booking.guestEmail.toLowerCase();
    const byUserEmail = await uniqueFriendMatch(
      db,
      `SELECT f.id
         FROM friends f
         INNER JOIN users u ON u.id = f.user_id
        WHERE f.line_account_id = ?
          AND f.is_following = 1
          AND lower(u.email) = ?`,
      [lineAccountId, email],
      'user_email',
    );
    if (byUserEmail.friendId) return byUserEmail;

    const byMetadataEmail = await uniqueFriendMatch(
      db,
      `SELECT id
         FROM friends
        WHERE line_account_id = ?
          AND is_following = 1
          AND lower(COALESCE(metadata, '')) LIKE ?`,
      [lineAccountId, `%${email}%`],
      'friend_metadata_email',
    );
    if (byMetadataEmail.friendId) return byMetadataEmail;
  }

  if (booking.guestPhone) {
    const digits = booking.guestPhone.replace(/\D/g, '');
    if (digits.length >= 8) {
      const byPhone = await uniqueFriendMatch(
        db,
        `SELECT f.id
           FROM friends f
           INNER JOIN users u ON u.id = f.user_id
          WHERE f.line_account_id = ?
            AND f.is_following = 1
            AND replace(replace(replace(replace(replace(COALESCE(u.phone, ''), '-', ''), ' ', ''), '(', ''), ')', ''), '+', '') LIKE ?`,
        [lineAccountId, `%${digits.slice(-8)}%`],
        'user_phone',
      );
      if (byPhone.friendId) return byPhone;
    }
  }

  if (booking.guestName) {
    return uniqueFriendMatch(
      db,
      `SELECT id
         FROM friends
        WHERE line_account_id = ?
          AND is_following = 1
          AND lower(display_name) = lower(?)`,
      [lineAccountId, booking.guestName],
      'line_display_name',
    );
  }

  return { friendId: null, matchedBy: null };
}

async function applyBookingTags(db: D1Database, friendId: string): Promise<void> {
  const tagRows = await db
    .prepare(
      `SELECT id, name
         FROM tags
        WHERE name IN (${[BOOKED_TAG_NAME, ...PENDING_TAG_NAMES].map(() => '?').join(',')})`,
    )
    .bind(BOOKED_TAG_NAME, ...PENDING_TAG_NAMES)
    .all<{ id: string; name: string }>();
  const byName = new Map((tagRows.results ?? []).map((row) => [row.name, row.id]));
  const now = jstNow();
  const bookedTag = byName.get(BOOKED_TAG_NAME);
  if (bookedTag) {
    await db
      .prepare(`INSERT OR IGNORE INTO friend_tags (friend_id, tag_id, assigned_at) VALUES (?, ?, ?)`)
      .bind(friendId, bookedTag, now)
      .run();
  }
  for (const name of PENDING_TAG_NAMES) {
    const tagId = byName.get(name);
    if (!tagId) continue;
    await db.prepare(`DELETE FROM friend_tags WHERE friend_id = ? AND tag_id = ?`).bind(friendId, tagId).run();
  }
}

function notificationBody(booking: ExtractedTimerexBooking, matchedBy: string | null): string {
  const lines = [
    `Code: ${booking.bookingCode ?? '(not found)'}`,
    `氏名: ${booking.guestName ?? '(未取得)'}`,
    `メール: ${booking.guestEmail ?? '(未取得)'}`,
    `電話: ${booking.guestPhone ?? '(未取得)'}`,
    `開始: ${booking.startsAt ?? '(未取得)'}`,
    `終了: ${booking.endsAt ?? '(未取得)'}`,
    `Meet: ${booking.meetUrl ?? '(未取得)'}`,
    `LINE照合: ${matchedBy ?? '未紐づき'}`,
  ];
  return lines.join('\n');
}

async function createDashboardNotification(
  db: D1Database,
  bookingId: string,
  booking: ExtractedTimerexBooking,
  matchedBy: string | null,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO notifications (id, rule_id, event_type, title, body, channel, status, metadata, created_at)
       VALUES (?, NULL, ?, ?, ?, 'dashboard', 'pending', ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      `timerex.${booking.status}`,
      booking.status === 'cancelled' ? 'TimeRex予約キャンセル' : 'TimeRex予約完了',
      notificationBody(booking, matchedBy),
      JSON.stringify({ timerexBookingId: bookingId, externalId: booking.externalId, matchedBy, bookingCode: booking.bookingCode }),
      jstNow(),
    )
    .run();
}

function isGoogleChatWebhook(url: string): boolean {
  try {
    return new URL(url).hostname === 'chat.googleapis.com';
  } catch {
    return false;
  }
}

function displayValue(value: string | null | undefined): string {
  return value && value.trim() ? value : '\u672a\u53d6\u5f97';
}

function formatJstDateTime(value: string | null | undefined): { date: string; time: string } | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  const y = byType.get('year');
  const m = byType.get('month');
  const d = byType.get('day');
  const h = byType.get('hour');
  const min = byType.get('minute');
  if (!y || !m || !d || !h || !min) return null;
  return { date: `${y}/${m}/${d}`, time: `${h}:${min}` };
}

function formatBookingDateRange(startsAt: string | null | undefined, endsAt: string | null | undefined): string {
  const start = formatJstDateTime(startsAt);
  if (!start) return '\u672a\u53d6\u5f97';
  const end = formatJstDateTime(endsAt);
  if (!end) return `${start.date} ${start.time}`;
  if (start.date === end.date) return `${start.date} ${start.time}-${end.time}`;
  return `${start.date} ${start.time}-${end.date} ${end.time}`;
}

function displayMatchedBy(matchedBy: string | null): string {
  if (!matchedBy) return '\u672a\u7d10\u3065\u304d';
  const labels: Record<string, string> = {
    timerex_booking_code: '\u4e88\u7d04\u30b3\u30fc\u30c9\u4e00\u81f4',
    user_email: '\u30e1\u30fc\u30eb\u4e00\u81f4',
    friend_metadata_email: '\u30e1\u30fc\u30eb\u4e00\u81f4',
    user_phone: '\u96fb\u8a71\u756a\u53f7\u4e00\u81f4',
    line_display_name: 'LINE\u8868\u793a\u540d\u4e00\u81f4',
  };
  return labels[matchedBy] ?? matchedBy;
}

function operatorNotificationText(
  _config: TimerexConfigRow,
  _bookingId: string,
  booking: ExtractedTimerexBooking,
  matchedBy: string | null,
): string {
  const title = booking.status === 'cancelled' ? 'TimeRex\u4e88\u7d04\u30ad\u30e3\u30f3\u30bb\u30eb' : 'TimeRex\u4e88\u7d04\u5b8c\u4e86';
  return [
    `\u3010${title}\u3011`,
    `\u4e88\u7d04\u30b3\u30fc\u30c9: ${displayValue(booking.bookingCode)}`,
    `\u65e5\u6642: ${formatBookingDateRange(booking.startsAt, booking.endsAt)}`,
    `\u6c0f\u540d: ${displayValue(booking.guestName)}`,
    `\u30e1\u30fc\u30eb: ${displayValue(booking.guestEmail)}`,
    `Meet: ${displayValue(booking.meetUrl)}`,
    `LINE\u7167\u5408: ${displayMatchedBy(matchedBy)}`,
  ].join('\n');
}

async function notifyExternalWebhook(
  config: TimerexConfigRow,
  bookingId: string,
  booking: ExtractedTimerexBooking,
  matchedBy: string | null,
): Promise<void> {
  const webhookUrl = config.notify_webhook_url;
  if (!webhookUrl) return;

  const payload = isGoogleChatWebhook(webhookUrl)
    ? { text: operatorNotificationText(config, bookingId, booking, matchedBy) }
    : {
        event: `timerex.${booking.status}`,
        bookingId,
        lineAccountId: config.line_account_id,
        matchedBy,
        booking,
      };

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(payload),
  });
}

async function upsertTimerexBooking(
  db: D1Database,
  config: TimerexConfigRow,
  booking: ExtractedTimerexBooking,
  raw: string,
  friendMatch: FriendMatch,
): Promise<string> {
  const existing = await db
    .prepare(`SELECT id, friend_id FROM timerex_bookings WHERE config_id = ? AND external_id = ?`)
    .bind(config.id, booking.externalId)
    .first<{ id: string; friend_id: string | null }>();
  const id = existing?.id ?? crypto.randomUUID();
  const friendId = friendMatch.friendId ?? existing?.friend_id ?? null;
  const matchedBy = friendMatch.friendId ? friendMatch.matchedBy : existing?.friend_id ? 'existing' : null;
  const now = jstNow();

  if (existing) {
    await db
      .prepare(
        `UPDATE timerex_bookings
            SET line_account_id = ?, friend_id = ?, event_type = ?, status = ?,
                guest_name = ?, guest_email = ?, guest_phone = ?, booking_code = ?,
                starts_at = ?, ends_at = ?, meet_url = ?, matched_by = ?,
                raw_payload = ?, updated_at = ?
          WHERE id = ?`,
      )
      .bind(
        config.line_account_id,
        friendId,
        booking.eventType,
        booking.status,
        booking.guestName,
        booking.guestEmail,
        booking.guestPhone,
        booking.bookingCode,
        booking.startsAt,
        booking.endsAt,
        booking.meetUrl,
        matchedBy,
        raw,
        now,
        id,
      )
      .run();
    return id;
  }

  await db
    .prepare(
      `INSERT INTO timerex_bookings
         (id, config_id, line_account_id, friend_id, external_id, event_type, status,
          guest_name, guest_email, guest_phone, booking_code, starts_at, ends_at, meet_url,
          matched_by, raw_payload, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      config.id,
      config.line_account_id,
      friendId,
      booking.externalId,
      booking.eventType,
      booking.status,
      booking.guestName,
      booking.guestEmail,
      booking.guestPhone,
      booking.bookingCode,
      booking.startsAt,
      booking.endsAt,
      booking.meetUrl,
      matchedBy,
      raw,
      now,
      now,
    )
    .run();
  return id;
}

async function scheduleIfLinked(
  db: D1Database,
  bookingId: string,
  booking: ExtractedTimerexBooking,
  friendId: string | null,
): Promise<void> {
  if (!friendId || booking.status !== 'booked') return;
  await applyBookingTags(db, friendId);
  await insertTimerexRemindersForBooking(
    db,
    bookingId,
    computeTimerexReminders(booking.startsAt),
  );
}

timerex.post('/api/integrations/timerex/webhook/:configId', async (c) => {
  const configId = c.req.param('configId');
  const config = await c.env.DB
    .prepare(
      `SELECT id, name, line_account_id, notify_webhook_url
         FROM timerex_webhook_configs
        WHERE id = ? AND is_active = 1`,
    )
    .bind(configId)
    .first<TimerexConfigRow>();
  if (!config) return c.json({ success: false, error: 'Webhook not found' }, 404);

  const raw = await c.req.text();
  let payload: unknown;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    return c.json({ success: false, error: 'Invalid JSON' }, 400);
  }

  const booking = await extractTimerexBooking(payload, raw);
  const friendMatch = await matchFriend(c.env.DB, config.line_account_id, booking);
  const bookingId = await upsertTimerexBooking(c.env.DB, config, booking, raw, friendMatch);
  if (booking.bookingCode && friendMatch.friendId) {
    await markTimerexBookingCodeUsed(c.env.DB, config.line_account_id, booking.bookingCode, bookingId);
  }

  if (booking.status === 'cancelled') {
    await cancelTimerexRemindersForBooking(c.env.DB, bookingId);
  } else {
    await scheduleIfLinked(c.env.DB, bookingId, booking, friendMatch.friendId);
  }

  c.executionCtx.waitUntil(
    Promise.allSettled([
      createDashboardNotification(c.env.DB, bookingId, booking, friendMatch.matchedBy),
      notifyExternalWebhook(config, bookingId, booking, friendMatch.matchedBy),
    ]).then(() => undefined),
  );

  return c.json({
    success: true,
    data: {
      bookingId,
      status: booking.status,
      matched: Boolean(friendMatch.friendId),
      matchedBy: friendMatch.matchedBy,
    },
  });
});

timerex.get('/api/timerex/bookings', async (c) => {
  const accountId = c.req.query('accountId');
  const status = c.req.query('status');
  const limit = Math.min(Number(c.req.query('limit') ?? '100') || 100, 200);
  const conditions: string[] = [];
  const binds: unknown[] = [];
  if (accountId) {
    conditions.push('b.line_account_id = ?');
    binds.push(accountId);
  }
  if (status) {
    conditions.push('b.status = ?');
    binds.push(status);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  binds.push(limit);
  const rows = await c.env.DB
    .prepare(
      `SELECT b.id, b.external_id, b.status, b.guest_name, b.guest_email, b.booking_code,
              b.starts_at, b.ends_at, b.meet_url, b.matched_by,
              b.created_at, b.updated_at,
              f.display_name AS friend_name
         FROM timerex_bookings b
         LEFT JOIN friends f ON f.id = b.friend_id
        ${where}
        ORDER BY COALESCE(b.starts_at, b.created_at) DESC
        LIMIT ?`,
    )
    .bind(...binds)
    .all();
  return c.json({ success: true, data: rows.results ?? [] });
});

timerex.post('/api/timerex/bookings/:id/link', async (c) => {
  const body = await c.req.json<{ friendId?: string }>();
  if (!body.friendId) return c.json({ success: false, error: 'friendId is required' }, 400);

  const booking = await c.env.DB
    .prepare(`SELECT id, line_account_id, starts_at, status FROM timerex_bookings WHERE id = ?`)
    .bind(c.req.param('id'))
    .first<{ id: string; line_account_id: string; starts_at: string | null; status: TimerexStatus }>();
  if (!booking) return c.json({ success: false, error: 'Booking not found' }, 404);

  const friend = await c.env.DB
    .prepare(`SELECT id FROM friends WHERE id = ? AND line_account_id = ? AND is_following = 1`)
    .bind(body.friendId, booking.line_account_id)
    .first<{ id: string }>();
  if (!friend) return c.json({ success: false, error: 'Friend not found for this account' }, 404);

  await c.env.DB
    .prepare(`UPDATE timerex_bookings SET friend_id = ?, matched_by = 'manual', updated_at = ? WHERE id = ?`)
    .bind(body.friendId, jstNow(), booking.id)
    .run();
  await applyBookingTags(c.env.DB, body.friendId);
  if (booking.status === 'booked') {
    await insertTimerexRemindersForBooking(
      c.env.DB,
      booking.id,
      computeTimerexReminders(booking.starts_at),
    );
  }

  return c.json({ success: true, data: { id: booking.id, friendId: body.friendId } });
});

export { timerex };
