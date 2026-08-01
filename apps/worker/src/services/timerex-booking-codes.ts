import { jstNow } from '@line-crm/db';

export const TIMEREX_BOOKING_CODE_PLACEHOLDER = '{{timerex_booking_code}}';

const CODE_PREFIX = 'SP';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_PART_LENGTH = 6;
const CODE_RE = /S\s*P\s*[-－ー]?\s*([A-Z0-9]{4,8})/i;

function randomCodePart(): string {
  const bytes = new Uint8Array(CODE_PART_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length])
    .join('');
}

export function normalizeTimerexBookingCode(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.toUpperCase().match(CODE_RE);
  if (!match) return null;
  return `${CODE_PREFIX}-${match[1].replace(/[^A-Z0-9]/g, '')}`;
}

export function extractTimerexBookingCode(values: string[]): string | null {
  for (const value of values) {
    const code = normalizeTimerexBookingCode(value);
    if (code) return code;
  }
  return null;
}

async function resolveLineAccountId(
  db: D1Database,
  friendId: string,
  lineAccountId?: string | null,
): Promise<string | null> {
  if (lineAccountId) return lineAccountId;
  const friend = await db
    .prepare('SELECT line_account_id FROM friends WHERE id = ?')
    .bind(friendId)
    .first<{ line_account_id: string | null }>();
  return friend?.line_account_id ?? null;
}

export async function getOrCreateTimerexBookingCode(
  db: D1Database,
  friendId: string,
  lineAccountId?: string | null,
): Promise<string | null> {
  const accountId = await resolveLineAccountId(db, friendId, lineAccountId);
  if (!accountId) return null;

  const existing = await db
    .prepare(
      `SELECT code
         FROM timerex_booking_codes
        WHERE line_account_id = ? AND friend_id = ?`,
    )
    .bind(accountId, friendId)
    .first<{ code: string }>();
  if (existing?.code) return existing.code;

  for (let attempt = 0; attempt < 8; attempt++) {
    const code = `${CODE_PREFIX}-${randomCodePart()}`;
    await db
      .prepare(
        `INSERT OR IGNORE INTO timerex_booking_codes
           (id, line_account_id, friend_id, code, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(crypto.randomUUID(), accountId, friendId, code, jstNow(), jstNow())
      .run();

    const created = await db
      .prepare(
        `SELECT code
           FROM timerex_booking_codes
          WHERE line_account_id = ? AND friend_id = ?`,
      )
      .bind(accountId, friendId)
      .first<{ code: string }>();
    if (created?.code) return created.code;
  }

  throw new Error('Failed to generate unique TimeRex booking code');
}

export async function fillTimerexBookingCodePlaceholder(
  db: D1Database,
  content: string,
  friendId: string,
  lineAccountId?: string | null,
): Promise<string> {
  if (!content.includes(TIMEREX_BOOKING_CODE_PLACEHOLDER)) return content;
  const code = await getOrCreateTimerexBookingCode(db, friendId, lineAccountId);
  return content.replaceAll(TIMEREX_BOOKING_CODE_PLACEHOLDER, code ?? '');
}

export async function findFriendByTimerexBookingCode(
  db: D1Database,
  lineAccountId: string,
  code: string | null,
): Promise<string | null> {
  const normalized = normalizeTimerexBookingCode(code);
  if (!normalized) return null;
  const row = await db
    .prepare(
      `SELECT friend_id
         FROM timerex_booking_codes
        WHERE line_account_id = ? AND code = ?`,
    )
    .bind(lineAccountId, normalized)
    .first<{ friend_id: string }>();
  return row?.friend_id ?? null;
}

export async function markTimerexBookingCodeUsed(
  db: D1Database,
  lineAccountId: string,
  code: string | null,
  bookingId: string,
): Promise<void> {
  const normalized = normalizeTimerexBookingCode(code);
  if (!normalized) return;
  await db
    .prepare(
      `UPDATE timerex_booking_codes
          SET last_booking_id = ?, last_used_at = ?, updated_at = ?
        WHERE line_account_id = ? AND code = ?`,
    )
    .bind(bookingId, jstNow(), jstNow(), lineAccountId, normalized)
    .run();
}
