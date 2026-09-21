import type { AdPlatformConfig, RefTracking } from '@line-crm/db';

/**
 * Meta Conversions API の1イベント分のペイロードを組み立てる。
 *
 * 送信そのものから切り出してあるのは、fbc のタイムスタンプ・重複排除キー・
 * action_source の3点が仕様上の落とし穴で、テストで固定したいため。
 */
export function buildMetaEventData(
  ref: RefTracking,
  eventName: string,
  eventValue?: number,
  now: number = Date.now(),
): Record<string, unknown> {
  // fbc の第3要素は「fbclid を受け取った時刻」であって送信時刻ではない。
  // 広告クリックから LINE 友だち追加までは数分〜数日空くため、ここを
  // 送信時刻にすると Meta 側のアトリビューション精度が落ちる。
  // ref_tracking.created_at は JST オフセット付き ISO8601 (jstNow)。
  const clickTime = Date.parse(ref.created_at);
  const fbcTimestamp = Number.isNaN(clickTime) ? now : clickTime;
  // LP上のMeta Pixelが発行した値を最優先する。ブラウザとCAPIで同じ
  // _fbc / _fbp を渡すことで、MetaがLeadを元の広告クリックへ結び付けやすくなる。
  const fbc = ref.fbc || (ref.fbclid ? `fb.1.${fbcTimestamp}.${ref.fbclid}` : undefined);

  const eventData: Record<string, unknown> = {
    event_name: eventName,
    event_time: Math.floor(now / 1000),
    // 同じ友だちの同じイベントは Meta 側で1件に畳む。LINE の webhook
    // 再配信やブロック解除後の再 follow による二重計上を防ぐ。
    event_id: `${eventName}:${ref.friend_id ?? ref.id}`,
    // action_source: 'website' は event_source_url が必須。取れていない
    // ときは 'other'（LINE アプリ内での発生）として送る。
    action_source: ref.source_url ? 'website' : 'other',
    user_data: {
      fbc,
      fbp: ref.fbp || undefined,
      client_ip_address: ref.ip_address || undefined,
      client_user_agent: ref.user_agent || undefined,
    },
  };

  if (ref.source_url) {
    eventData.event_source_url = ref.source_url;
  }

  if (eventValue) {
    eventData.custom_data = { currency: 'JPY', value: eventValue };
  }

  return eventData;
}


export interface MetaReceipt { events_received: number; fbtrace_id?: string; message_count: number }

/** Check actual acceptance; a 200 response alone is not proof an event was accepted. */
export async function postMetaEvent(config: AdPlatformConfig, eventData: Record<string, unknown>): Promise<MetaReceipt> {
  const response = await fetch(`https://graph.facebook.com/v21.0/${config.pixel_id}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({
      data: [eventData], access_token: config.access_token,
      ...(config.test_event_code ? { test_event_code: config.test_event_code } : {}),
    }),
  });
  const body = await response.json() as {
    events_received?: number; fbtrace_id?: string; messages?: unknown[];
    error?: { code?: number; error_subcode?: number };
  };
  if (!response.ok || body.error || body.events_received !== 1) {
    // Exclude provider messages / full response: they may echo sensitive data.
    throw new Error(`Meta CAPI rejected HTTP=${response.status} code=${body.error?.code ?? 'none'} received=${body.events_received ?? 0}`);
  }
  return {
    events_received: body.events_received,
    ...(typeof body.fbtrace_id === 'string' ? { fbtrace_id: body.fbtrace_id } : {}),
    message_count: Array.isArray(body.messages) ? body.messages.length : 0,
  };
}
