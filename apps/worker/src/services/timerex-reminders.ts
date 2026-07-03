import { LineClient } from '@line-crm/line-sdk';

export type TimerexReminderKind = 'two_days_before' | 'day_before' | 'hours_before';

export interface ComputedTimerexReminder {
  kind: TimerexReminderKind;
  scheduled_at: string;
}

const JST_OFFSET_MS = 9 * 3600_000;
const REMINDER_MAX_RETRY = 3;

function reminderAt18JstBefore(startMs: number, daysBefore: number): Date {
  const startJst = new Date(startMs + JST_OFFSET_MS);
  return new Date(
    Date.UTC(
      startJst.getUTCFullYear(),
      startJst.getUTCMonth(),
      startJst.getUTCDate() - daysBefore,
      9,
      0,
      0,
    ),
  );
}

export function computeTimerexReminders(
  startsAtUtc: string | null,
  now: Date = new Date(),
): ComputedTimerexReminder[] {
  if (!startsAtUtc) return [];
  const startMs = new Date(startsAtUtc).getTime();
  if (!Number.isFinite(startMs)) return [];

  const out: ComputedTimerexReminder[] = [];
  const nowMs = now.getTime();

  const twoDaysBeforeAt18JstAsUtc = reminderAt18JstBefore(startMs, 2);
  if (twoDaysBeforeAt18JstAsUtc.getTime() > nowMs) {
    out.push({ kind: 'two_days_before', scheduled_at: twoDaysBeforeAt18JstAsUtc.toISOString() });
  }

  const dayBeforeAt18JstAsUtc = reminderAt18JstBefore(startMs, 1);
  if (dayBeforeAt18JstAsUtc.getTime() > nowMs) {
    out.push({ kind: 'day_before', scheduled_at: dayBeforeAt18JstAsUtc.toISOString() });
  }

  const twoHoursBefore = new Date(startMs - 2 * 3600_000);
  if (twoHoursBefore.getTime() > nowMs) {
    out.push({ kind: 'hours_before', scheduled_at: twoHoursBefore.toISOString() });
  }

  return out;
}

export async function insertTimerexRemindersForBooking(
  db: D1Database,
  bookingId: string,
  reminders: ComputedTimerexReminder[],
): Promise<void> {
  for (const reminder of reminders) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO timerex_booking_reminders
           (id, booking_id, kind, scheduled_at, status, retry_count)
         VALUES (?, ?, ?, ?, 'pending', 0)`,
      )
      .bind(crypto.randomUUID(), bookingId, reminder.kind, reminder.scheduled_at)
      .run();
  }
}

export async function cancelTimerexRemindersForBooking(
  db: D1Database,
  bookingId: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE timerex_booking_reminders
          SET status = 'cancelled'
        WHERE booking_id = ? AND status IN ('pending','failed')`,
    )
    .bind(bookingId)
    .run();
}

interface DueTimerexReminderRow {
  id: string;
  booking_id: string;
  kind: TimerexReminderKind;
  retry_count: number;
  starts_at: string;
  guest_name: string | null;
  meet_url: string | null;
  channel_access_token: string;
  line_user_id: string;
}

function formatJst(utcIso: string): string {
  const jst = new Date(new Date(utcIso).getTime() + JST_OFFSET_MS).toISOString();
  return `${jst.slice(0, 10)} ${jst.slice(11, 16)}`;
}

function renderTimerexReminderText(row: DueTimerexReminderRow): string {
  const guestLine = row.guest_name ? `\nお名前: ${row.guest_name}` : '';
  const meetLine = row.meet_url
    ? `\n\nGoogle Meet: ${row.meet_url}`
    : '\n\nGoogle Meet URLは、TimeRexの予約完了メールをご確認ください。';
  const dateLine = `日時: ${formatJst(row.starts_at)}`;

  if (row.kind === 'two_days_before') {
    return `【2日前の無料オンライン面談リマインド】\n\n無料オンライン面談の2日前です。\n${dateLine}${guestLine}${meetLine}\n\nご都合が変わった場合は、予約完了メール内の変更・キャンセルリンクからお手続きください。`;
  }

  if (row.kind === 'day_before') {
    return `【前日の無料オンライン面談リマインド】\n\n明日は無料オンライン面談です。\n${dateLine}${guestLine}${meetLine}\n\nご都合が変わった場合は、予約完了メール内の変更・キャンセルリンクからお手続きください。`;
  }

  return `【本日の無料オンライン面談リマインド】\n\n無料オンライン面談の開始まで、あと約2時間です。\n${dateLine}${guestLine}${meetLine}\n\nお時間になりましたら、予約完了メールまたは上記URLからご参加ください。`;
}

async function logOutgoingTimerexReminder(
  db: D1Database,
  params: {
    friendId: string;
    lineAccountId: string;
    content: string;
    createdAt: string;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO messages_log
         (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, delivery_type, source, line_account_id, created_at)
       VALUES (?, ?, 'outgoing', 'text', ?, NULL, NULL, 'push', 'timerex_reminder', ?, ?)`,
    )
    .bind(crypto.randomUUID(), params.friendId, params.content, params.lineAccountId, params.createdAt)
    .run();
}

export async function processDueTimerexReminders(
  db: D1Database,
  params: { now: Date },
): Promise<{ sent: number; failed: number }> {
  const nowIso = params.now.toISOString();
  const due = await db
    .prepare(
      `SELECT r.id, r.booking_id, r.kind, r.retry_count,
              b.starts_at, b.guest_name, b.meet_url,
              la.channel_access_token,
              f.line_user_id
         FROM timerex_booking_reminders r
         INNER JOIN timerex_bookings b ON b.id = r.booking_id
         INNER JOIN line_accounts la ON la.id = b.line_account_id
         INNER JOIN friends f ON f.id = b.friend_id
        WHERE r.status IN ('pending','failed')
          AND r.scheduled_at <= ?
          AND b.status = 'booked'
          AND b.friend_id IS NOT NULL
          AND b.starts_at > ?
        LIMIT 100`,
    )
    .bind(nowIso, nowIso)
    .all<DueTimerexReminderRow>();

  let sent = 0;
  let failed = 0;

  for (const row of due.results ?? []) {
    const claim = await db
      .prepare(
        `UPDATE timerex_booking_reminders
            SET retry_count = retry_count + 1
          WHERE id = ? AND retry_count = ? AND status IN ('pending','failed')`,
      )
      .bind(row.id, row.retry_count)
      .run();
    if ((claim.meta?.changes ?? 0) === 0) continue;

    try {
      const text = renderTimerexReminderText(row);
      const client = new LineClient(row.channel_access_token);
      await client.pushMessage(row.line_user_id, [{ type: 'text', text }]);
      await db
        .prepare(`UPDATE timerex_booking_reminders SET status = 'sent', sent_at = ? WHERE id = ?`)
        .bind(nowIso, row.id)
        .run();

      const booking = await db
        .prepare(`SELECT friend_id, line_account_id FROM timerex_bookings WHERE id = ?`)
        .bind(row.booking_id)
        .first<{ friend_id: string; line_account_id: string }>();
      if (booking?.friend_id) {
        await logOutgoingTimerexReminder(db, {
          friendId: booking.friend_id,
          lineAccountId: booking.line_account_id,
          content: text,
          createdAt: nowIso,
        });
      }
      sent++;
    } catch (error) {
      const retryCount = row.retry_count + 1;
      const status = retryCount >= REMINDER_MAX_RETRY ? 'failed_permanent' : 'failed';
      await db
        .prepare(
          `UPDATE timerex_booking_reminders
              SET status = ?, last_error = ?
            WHERE id = ?`,
        )
        .bind(status, error instanceof Error ? error.message : String(error), row.id)
        .run();
      failed++;
    }
  }

  return { sent, failed };
}
