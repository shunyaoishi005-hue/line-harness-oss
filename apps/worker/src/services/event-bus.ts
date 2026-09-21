import { extractFlexAltText } from '../utils/flex-alt-text.js';

/**
 * イベントバス — システム内イベントの発火と処理
 *
 * イベント発生時に以下を実行:
 * 1. アクティブな送信Webhookへ通知
 * 2. スコアリングルール適用
 * 3. 自動化ルール(IF-THEN)実行
 */

import {
  getActiveOutgoingWebhooksByEvent,
  applyScoring,
  getActiveAutomationsByEvent,
  createAutomationLog,
  removeTagFromFriend,
  enrollFriendInScenario,
  jstNow,
  getFriendScore,
} from '@line-crm/db';
import { LineClient } from '@line-crm/line-sdk';
import type { Message } from '@line-crm/line-sdk';
import { sendAdConversions } from './ad-conversion.js';
import { keywordMatches } from './keyword-match.js';
import { stopStepDeliveriesForTag } from './step-stop-tags.js';
import { fillTimerexBookingCodePlaceholder } from './timerex-booking-codes.js';
import { isTimerexRescheduleIntent } from './timerex-intents.js';
import {
  claimTagEffects,
  createTagAutomationDispatch,
  resolveTagEventAccount,
  tagChangeKey,
  type TagAutomationDispatch,
} from './tag-automation-context.js';

const LINE_SPLIT_TOKEN = '{{line_split}}';

export interface EventPayload {
  friendId?: string;
  eventData?: Record<string, unknown>;
  conversionEventName?: string;
  conversionEventTimeMs?: number;
  conversionValue?: number;
  replyToken?: string;
}

/**
 * Fire an event and run all registered handlers.
 *
 * Execution is split into two sequential phases so that score_threshold
 * conditions in automation rules see the score already updated by this event:
 *
 *   Phase 1 (concurrent): outgoing webhooks + scoring
 *   Phase 2 (concurrent): automations + notifications, with currentScore injected
 */
export async function fireEvent(
  db: D1Database,
  eventType: string,
  payload: EventPayload,
  lineAccessToken?: string,
  lineAccountId?: string | null,
  dispatch: TagAutomationDispatch = createTagAutomationDispatch(),
): Promise<void> {
  if (eventType === 'tag_change' && payload.friendId) {
    const tagId = payload.eventData?.tagId;
    const action = payload.eventData?.action;
    if (typeof tagId === 'string' && typeof action === 'string') {
      const key = tagChangeKey(payload.friendId, tagId, action);
      if (dispatch.events.has(key)) return;
      // Manual tag requests reach the event bus without the automatic helper;
      // include their initial mutation so a remove/add automation cannot repeat it.
      claimTagEffects(dispatch, key);
      dispatch.events.add(key);
    }
    const account = await resolveTagEventAccount(db, payload.friendId, lineAccountId);
    lineAccessToken = account.accessToken;
    lineAccountId = account.accountId;
  }
  // Phase 1: fire webhooks, apply scoring rules, and ad conversion postback concurrently.
  const phase1: Promise<unknown>[] = [
    fireOutgoingWebhooks(db, eventType, payload),
    processScoring(db, eventType, payload),
  ];
  if (payload.friendId && payload.conversionEventName) {
    phase1.push(
      sendAdConversions(db, payload.friendId, payload.conversionEventName, payload.conversionValue, payload.conversionEventTimeMs),
    );
  }
  await Promise.allSettled(phase1);

  // Build an enriched payload with the freshly-updated score.
  const enrichedPayload: EventPayload = payload.friendId
    ? {
        ...payload,
        eventData: {
          ...payload.eventData,
          currentScore: await getFriendScore(db, payload.friendId),
        },
      }
    : payload;

  // Phase 2: evaluate automations.
  await processAutomations(db, eventType, enrichedPayload, lineAccessToken, lineAccountId, dispatch);
}

/**
 * 送信Webhookへの通知。fireEvent の Phase 1 で呼ばれるほか、friend を伴わない
 * システムイベント (quota_alert 等) の単独発火にも使う (services/quota-alert.ts)。
 * 失敗はすべて握りつぶす (best-effort)。戻り値は 2xx で受理された配信数 —
 * 呼び出し元 (quota-alert 等) が「実際に届いたか」を記録に反映できるようにする。
 * prefetched: 呼び出し元が購読者リストを取得済みなら渡すと再クエリを省ける。
 */
export async function fireOutgoingWebhooks(
  db: D1Database,
  eventType: string,
  payload: EventPayload,
  prefetched?: Awaited<ReturnType<typeof getActiveOutgoingWebhooksByEvent>>,
): Promise<number> {
  let delivered = 0;
  try {
    const webhooks = prefetched ?? (await getActiveOutgoingWebhooksByEvent(db, eventType));
    for (const wh of webhooks) {
      try {
        const body = JSON.stringify({
          event: eventType,
          timestamp: jstNow(),
          data: payload,
        });

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };

        // HMAC署名（シークレットがある場合）
        if (wh.secret) {
          const encoder = new TextEncoder();
          const key = await crypto.subtle.importKey(
            'raw',
            encoder.encode(wh.secret),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign'],
          );
          const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
          const hexSignature = Array.from(new Uint8Array(signature))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
          headers['X-Webhook-Signature'] = hexSignature;
        }

        const res = await fetch(wh.url, { method: 'POST', headers, body });
        if (res.ok) {
          delivered += 1;
        } else {
          console.error(`送信Webhook ${wh.id} への通知失敗: HTTP ${res.status}`);
        }
      } catch (err) {
        console.error(`送信Webhook ${wh.id} への通知失敗:`, err);
      }
    }
  } catch (err) {
    console.error('fireOutgoingWebhooks error:', err);
  }
  return delivered;
}

/** スコアリングルール適用 */
async function processScoring(
  db: D1Database,
  eventType: string,
  payload: EventPayload,
): Promise<void> {
  if (!payload.friendId) return;
  try {
    await applyScoring(db, payload.friendId, eventType);
  } catch (err) {
    console.error('processScoring error:', err);
  }
}

/** 自動化ルール(IF-THEN)実行 */
async function processAutomations(
  db: D1Database,
  eventType: string,
  payload: EventPayload,
  lineAccessToken?: string,
  lineAccountId?: string | null,
  dispatch: TagAutomationDispatch = createTagAutomationDispatch(),
): Promise<void> {
  try {
    const allAutomations = await getActiveAutomationsByEvent(db, eventType);
    // Filter by account: match this account's automations + unassigned (backward compat)
    const automations = allAutomations.filter(
      (a) => !a.line_account_id || a.line_account_id === lineAccountId || (eventType !== 'tag_change' && !lineAccountId),
    );

    for (const automation of automations) {
      const conditions = JSON.parse(automation.conditions) as Record<string, unknown>;
      const actions = JSON.parse(automation.actions) as Array<{ type: string; params: Record<string, string> }>;

      if (!(await matchConditions(db, conditions, payload, eventType))) continue;

      const results: Array<{ action: string; success: boolean; error?: string }> = [];

      for (const action of actions) {
        try {
          await executeAction(db, action, payload, lineAccessToken, lineAccountId, dispatch);
          results.push({ action: action.type, success: true });
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          results.push({ action: action.type, success: false, error: errorMsg });
        }
      }

      const allSuccess = results.every((r) => r.success);
      const anySuccess = results.some((r) => r.success);

      await createAutomationLog(db, {
        automationId: automation.id,
        friendId: payload.friendId,
        eventData: JSON.stringify(payload.eventData ?? {}),
        actionsResult: JSON.stringify(results),
        status: allSuccess ? 'success' : anySuccess ? 'partial' : 'failed',
      });
    }
  } catch (err) {
    console.error('processAutomations error:', err);
  }
}

/** 条件マッチング */
async function matchConditions(
  db: D1Database,
  conditions: Record<string, unknown>,
  payload: EventPayload,
  eventType: string,
): Promise<boolean> {
  // 条件が空 → 常にマッチ
  if (Object.keys(conditions).length === 0) return true;

  // score_threshold チェック
  if (conditions.score_threshold !== undefined && payload.eventData) {
    const currentScore = payload.eventData.currentScore as number | undefined;
    if (currentScore !== undefined && currentScore < (conditions.score_threshold as number)) {
      return false;
    }
  }

  // tag_id チェック
  if (conditions.tag_id !== undefined && payload.eventData) {
    if (payload.eventData.tagId !== conditions.tag_id) return false;
  }

  if (conditions.has_tag_ids !== undefined) {
    if (!payload.friendId) return false;
    const tagIds = normalizeStringArray(conditions.has_tag_ids);
    if (tagIds.length > 0 && !(await friendHasAllTags(db, payload.friendId, tagIds))) return false;
  }

  if (conditions.missing_tag_ids !== undefined) {
    if (!payload.friendId) return false;
    const tagIds = normalizeStringArray(conditions.missing_tag_ids);
    if (tagIds.length > 0 && (await friendHasAnyTag(db, payload.friendId, tagIds))) return false;
  }

  // keyword チェック（message_received / postback_received イベント用）
  if (conditions.keyword !== undefined && payload.eventData) {
    const text = payload.eventData.text as string | undefined;
    if (!text) return false;
    // Only human message text shares auto-reply/inbox normalization. Postback
    // data is opaque, and event payloads/logs must retain the original input.
    if (eventType === 'message_received' && typeof conditions.keyword === 'string') {
      const matchesKeyword = keywordMatches(
        { keyword: conditions.keyword, match_type: 'contains' },
        text,
        { normalizeText: true },
      );
      const matchesTimerexReschedule = conditions.keyword === '日程変更' && isTimerexRescheduleIntent(text);
      if (!matchesKeyword && !matchesTimerexReschedule) return false;
    } else if (!text.includes(conditions.keyword as string)) return false;
  }

  // keyword_exact（完全一致）
  if (conditions.keyword_exact) {
    const rawText = payload.eventData?.text as string | undefined;
    if (eventType === 'message_received' && typeof conditions.keyword_exact === 'string') {
      if (!keywordMatches({ keyword: conditions.keyword_exact, match_type: 'exact' }, rawText || '', { normalizeText: true })) return false;
    } else if ((rawText || '').trim() !== conditions.keyword_exact) return false;
  }

  return true;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
}

async function countFriendTags(db: D1Database, friendId: string, tagIds: string[]): Promise<number> {
  if (tagIds.length === 0) return 0;
  const placeholders = tagIds.map(() => '?').join(', ');
  const row = await db
    .prepare(
      `SELECT COUNT(DISTINCT tag_id) AS count
       FROM friend_tags
       WHERE friend_id = ? AND tag_id IN (${placeholders})`,
    )
    .bind(friendId, ...tagIds)
    .first<{ count: number }>();
  return Number(row?.count ?? 0);
}

async function friendHasAllTags(db: D1Database, friendId: string, tagIds: string[]): Promise<boolean> {
  return (await countFriendTags(db, friendId, tagIds)) === tagIds.length;
}

async function friendHasAnyTag(db: D1Database, friendId: string, tagIds: string[]): Promise<boolean> {
  return (await countFriendTags(db, friendId, tagIds)) > 0;
}

/** アクション実行 */
async function executeAction(
  db: D1Database,
  action: { type: string; params: Record<string, string> },
  payload: EventPayload,
  lineAccessToken?: string,
  lineAccountId?: string | null,
  dispatch: TagAutomationDispatch = createTagAutomationDispatch(),
): Promise<void> {
  const friendId = payload.friendId;
  if (!friendId && action.type !== 'send_webhook') {
    throw new Error('friendId is required for this action');
  }

  switch (action.type) {
    case 'add_tag': {
      // Dynamic import avoids introducing a static event-bus ↔ tag-helper cycle.
      const { attachTagAndFireSideEffects } = await import('./friend-tag-attach.js');
      await attachTagAndFireSideEffects(db, friendId!, action.params.tagId, undefined, {
        lineAccountId,
        dispatch,
      });
      await stopStepDeliveriesForTag(db, friendId!, action.params.tagId);
      break;
    }

    case 'remove_tag':
      await removeTagFromFriend(db, friendId!, action.params.tagId);
      break;

    case 'start_scenario':
      await enrollFriendInScenario(db, friendId!, action.params.scenarioId);
      break;

    case 'send_message': {
      if (!lineAccessToken || !friendId) throw new Error('LINE account credentials are unavailable for this action');
      const friend = await db
        .prepare('SELECT line_user_id FROM friends WHERE id = ?')
        .bind(friendId)
        .first<{ line_user_id: string }>();
      if (!friend) break;
      const lineClient = new LineClient(lineAccessToken);

      // template_id が set なら templates から content/type を resolve、
      // なければ inline params を使う。template が見つからない (削除済 等) は
      // inline fallback (content が空なら下流の JSON.parse が throw → automation
      // 全体は partial 扱い)。
      let resolvedType = action.params.messageType || 'text';
      let resolvedContent = action.params.content ?? '';
      const tplId = action.params.template_id;
      if (tplId) {
        const { getTemplateById } = await import('@line-crm/db');
        const tpl = await getTemplateById(db, tplId);
        if (tpl) {
          resolvedType = tpl.message_type;
          resolvedContent = tpl.message_content;
        }
      }
      resolvedContent = await fillTimerexBookingCodePlaceholder(
        db,
        resolvedContent,
        friendId,
        lineAccountId,
      );

      const outgoingMessages = buildAutomationMessages(resolvedType, resolvedContent, action.params.altText);
      const lineMessages = outgoingMessages.map((item) => item.message);

      let deliveryType: 'reply' | 'push';
      if (payload.replyToken) {
        try {
          await lineClient.replyMessage(payload.replyToken, lineMessages);
          payload.replyToken = undefined;
          deliveryType = 'reply';
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          const isTokenError = errMsg.includes('400') || errMsg.includes('Invalid reply token');
          if (isTokenError) {
            await lineClient.pushMessage(friend.line_user_id, lineMessages);
            deliveryType = 'push';
          } else {
            throw err;
          }
        }
      } else {
        await lineClient.pushMessage(friend.line_user_id, lineMessages);
        deliveryType = 'push';
      }

      // log は実際に送信した message の type / content を反映する。
      // {{line_split}} で分割した場合も、管理画面には送信済みの各通をそのまま残す。
      for (const item of outgoingMessages) {
        await logOutgoingMessage(db, {
          friendId,
          messageType: item.message.type,
          content: item.logContent,
          deliveryType,
          source: 'automation',
          lineAccountId,
        });
      }
      break;
    }

    case 'send_webhook': {
      const url = action.params.url;
      if (url) {
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ friendId, ...payload.eventData }),
        });
      }
      break;
    }

    case 'switch_rich_menu': {
      if (!lineAccessToken || !friendId) throw new Error('LINE account credentials are unavailable for this action');
      const friend = await db
        .prepare('SELECT line_user_id FROM friends WHERE id = ?')
        .bind(friendId)
        .first<{ line_user_id: string }>();
      if (!friend) break;
      const lineClient = new LineClient(lineAccessToken);
      await lineClient.linkRichMenuToUser(friend.line_user_id, action.params.richMenuId);
      break;
    }

    case 'remove_rich_menu': {
      if (!lineAccessToken || !friendId) throw new Error('LINE account credentials are unavailable for this action');
      const friend = await db
        .prepare('SELECT line_user_id FROM friends WHERE id = ?')
        .bind(friendId)
        .first<{ line_user_id: string }>();
      if (!friend) break;
      const lineClient = new LineClient(lineAccessToken);
      await lineClient.unlinkRichMenuFromUser(friend.line_user_id);
      break;
    }

    case 'set_metadata': {
      if (!friendId) break;
      const existing = await db
        .prepare('SELECT metadata FROM friends WHERE id = ?')
        .bind(friendId)
        .first<{ metadata: string }>();
      const current = JSON.parse(existing?.metadata || '{}') as Record<string, unknown>;
      // {{message}} を受信メッセージ内容に置換してからパース
      // JSON文字列内に埋め込むため、JSON仕様に準拠して全制御文字をエスケープ
      const escapeForJsonString = (s: string): string =>
        s
          .replace(/\\/g, '\\\\')
          .replace(/"/g, '\\"')
          .replace(/\n/g, '\\n')
          .replace(/\r/g, '\\r')
          .replace(/\t/g, '\\t')
          .replace(/[\u0000-\u001f]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
      const messageText = (payload.eventData?.text as string | undefined) || '';
      const raw = (action.params.data || '{}')
        .replace(/\{\{message\}\}/g, escapeForJsonString(messageText));
      const patch = JSON.parse(raw) as Record<string, unknown>;
      const merged = { ...current, ...patch };
      await db
        .prepare('UPDATE friends SET metadata = ?, updated_at = ? WHERE id = ?')
        .bind(JSON.stringify(merged), jstNow(), friendId)
        .run();
      break;
    }

    default:
      console.warn(`未知のアクションタイプ: ${action.type}`);
  }
}

type AutomationMessageForLog = {
  message: Message;
  logContent: string;
};

function buildAutomationMessages(messageType: string, messageContent: string, altText?: string): AutomationMessageForLog[] {
  if (messageType === 'text') {
    return splitLineTextContent(messageContent).map((part) => ({
      message: { type: 'text', text: part },
      logContent: part,
    }));
  }

  if (messageType === 'flex') {
    const contents = JSON.parse(messageContent);
    return [{
      message: { type: 'flex', altText: altText || extractFlexAltText(contents), contents },
      logContent: JSON.stringify(contents),
    }];
  }

  if (messageType === 'image') {
    const parsed = JSON.parse(messageContent) as { originalContentUrl: string; previewImageUrl: string };
    return [{
      message: {
        type: 'image',
        originalContentUrl: parsed.originalContentUrl,
        previewImageUrl: parsed.previewImageUrl,
      },
      logContent: JSON.stringify(parsed),
    }];
  }

  return [{ message: { type: 'text', text: messageContent }, logContent: messageContent }];
}

function splitLineTextContent(content: string): string[] {
  if (!content.includes(LINE_SPLIT_TOKEN)) return [content];
  const parts = content
    .split(LINE_SPLIT_TOKEN)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 5);
  return parts.length > 0 ? parts : [''];
}

/** 送信メッセージを messages_log に記録（失敗しても例外を上げない） */
export async function logOutgoingMessage(
  db: D1Database,
  params: {
    friendId: string;
    messageType: string;
    content: string;
    deliveryType: 'reply' | 'push';
    source: string;
    lineAccountId?: string | null;
  },
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, delivery_type, source, line_account_id, created_at)
         VALUES (?, ?, 'outgoing', ?, ?, NULL, NULL, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        params.friendId,
        params.messageType,
        params.content,
        params.deliveryType,
        params.source,
        params.lineAccountId ?? null,
        jstNow(),
      )
      .run();
  } catch (err) {
    console.error('logOutgoingMessage failed:', err);
  }
}
