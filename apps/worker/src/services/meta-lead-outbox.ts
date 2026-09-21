import { getActiveAdPlatforms, logAdConversion, type AdPlatformConfig, type RefTracking } from '@line-crm/db';
import { buildMetaEventData, postMetaEvent } from './meta-capi.js';

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
interface PendingLead {
  id: string; friend_id: string; ad_platform_id: string; pixel_id: string;
  event_time: number; attempts: number; payload: string | null;
}

/** Persist the actual follow time before waiting for OAuth/LIFF attribution. */
export async function enqueueMetaLead(db: D1Database, friendId: string, eventTimeMs: number): Promise<void> {
  if (!Number.isFinite(eventTimeMs) || eventTimeMs <= 0 || eventTimeMs > Date.now() + 60_000) {
    throw new Error('Invalid Meta Lead occurrence time');
  }
  for (const platform of (await getActiveAdPlatforms(db)).filter(p => p.name === 'meta')) {
    const config: AdPlatformConfig = JSON.parse(platform.config);
    if (!config.pixel_id) continue;
    const now = Date.now();
    await db.prepare(`INSERT INTO meta_lead_outbox
      (id, friend_id, ad_platform_id, pixel_id, event_time, next_attempt_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(friend_id, ad_platform_id) DO NOTHING`)
      .bind(`Lead:${friendId}:${platform.id}`, friendId, platform.id, config.pixel_id,
        Math.floor(eventTimeMs / 1000), now, now, now).run();
  }
}

/** Immediate delivery and the existing cron share a durable, leased outbox. */
export async function processMetaLeadOutbox(
  db: D1Database, options: { friendId?: string; now?: number; limit?: number } = {},
): Promise<{ sent: number; pending: number; expired: number }> {
  const now = options.now ?? Date.now();
  const result = { sent: 0, pending: 0, expired: 0 };
  const due = await db.prepare(`SELECT id, friend_id, ad_platform_id, pixel_id, event_time, attempts, payload
    FROM meta_lead_outbox WHERE status IN ('pending','processing') AND next_attempt_at <= ?
    AND (? IS NULL OR friend_id = ?) ORDER BY next_attempt_at, id LIMIT ?`)
    .bind(now, options.friendId ?? null, options.friendId ?? null,
      Math.max(1, Math.min(options.limit ?? 10, 25))).all<PendingLead>();
  for (const item of due.results) {
    const token = crypto.randomUUID();
    const claim = await db.prepare(`UPDATE meta_lead_outbox SET status='processing', lease_token=?,
      next_attempt_at=?, attempts=attempts+1, updated_at=?
      WHERE id=? AND status IN ('pending','processing') AND next_attempt_at <= ?`)
      .bind(token, now + 120_000, now, item.id, now).run();
    if (!claim.meta.changes) continue;
    try {
      const alreadySent = await db.prepare(`SELECT id FROM ad_conversion_logs
        WHERE friend_id=? AND ad_platform_id=? AND event_name='Lead' AND status='sent' LIMIT 1`)
        .bind(item.friend_id, item.ad_platform_id).first<{ id: string }>();
      if (alreadySent) {
        await finish('sent', null, 'already_sent');
        continue;
      }
      if (now - item.event_time * 1000 >= MAX_AGE_MS) {
        await finish('expired', 'event_older_than_7_days', null);
        result.expired++;
        continue;
      }
      const platform = await db.prepare(`SELECT config FROM ad_platforms WHERE id=? AND name='meta' AND is_active=1`)
        .bind(item.ad_platform_id).first<{ config: string }>();
      if (!platform) throw new Error('platform_inactive');
      const config: AdPlatformConfig = JSON.parse(platform.config);
      if (config.pixel_id !== item.pixel_id) throw new Error('pixel_changed');
      if (config.test_event_code) throw new Error('test_mode_enabled');
      if (!config.access_token) throw new Error('access_token_missing');

      let payload: Record<string, unknown>;
      if (item.payload) {
        payload = JSON.parse(item.payload) as Record<string, unknown>;
      } else {
        // A visit AFTER the conversion must never replace its original attribution.
        const ref = await db.prepare(`SELECT * FROM ref_tracking WHERE friend_id=?
          AND (length(fbclid)>0 OR length(fbc)>0)
          AND julianday(created_at) <= julianday(?, 'unixepoch')
          ORDER BY julianday(created_at) DESC, id DESC LIMIT 1`)
          .bind(item.friend_id, item.event_time + 1).first<RefTracking>();
        if (!ref) throw new Error('waiting_for_meta_attribution');
        payload = buildMetaEventData(ref, 'Lead', undefined, item.event_time * 1000);
        await db.prepare(`UPDATE meta_lead_outbox SET payload=? WHERE id=? AND lease_token=?`)
          .bind(JSON.stringify(payload), item.id, token).run();
      }
      const response = await postMetaEvent(config, payload);
      const summary = JSON.stringify(response);
      await finish('sent', null, summary);
      result.sent++;
      const data = payload.user_data as { fbc?: string };
      await logAdConversion(db, {
        platformId: item.ad_platform_id, friendId: item.friend_id, eventName: 'Lead',
        clickId: data.fbc ?? '', clickIdType: 'fbc', status: 'sent', responseBody: summary,
      }).catch(() => console.error('[meta-lead] legacy_log_write_failed'));
    } catch (error) {
      // Never persist arbitrary error text: providers may echo credentials/identifiers.
      const allowed = ['platform_inactive', 'pixel_changed', 'test_mode_enabled', 'access_token_missing', 'waiting_for_meta_attribution'];
      const reason = error instanceof Error && allowed.includes(error.message) ? error.message : 'meta_delivery_failed';
      const delay = Math.min(60 * 60_000, 60_000 * 2 ** Math.min(item.attempts, 6));
      await db.prepare(`UPDATE meta_lead_outbox SET status='pending', lease_token=NULL,
        next_attempt_at=?, last_error=?, updated_at=? WHERE id=? AND lease_token=?`)
        .bind(now + delay, reason, now, item.id, token).run();
      result.pending++;
    }
    async function finish(status: 'sent' | 'expired', error: string | null, summary: string | null) {
      await db.prepare(`UPDATE meta_lead_outbox SET status=?, lease_token=NULL, last_error=?,
        response_summary=?, updated_at=? WHERE id=? AND lease_token=?`)
        .bind(status, error, summary, now, item.id, token).run();
    }
  }
  return result;
}
