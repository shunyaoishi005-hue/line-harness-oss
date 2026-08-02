/**
 * 広告CV送信サービス
 *
 * LINE内アクション発生時に、友だちの広告クリックIDを元に
 * 各広告媒体のConversion APIへオフラインCVを送信する。
 */

import {
  getActiveAdPlatforms,
  getRefTrackingWithClickIds,
  logAdConversion,
  type AdPlatformConfig,
  type RefTracking,
} from '@line-crm/db';

export async function sendAdConversions(
  db: D1Database,
  friendId: string,
  eventName: string,
  eventValue?: number,
): Promise<void> {
  const ref = await getRefTrackingWithClickIds(db, friendId);
  if (!ref) return;

  const platforms = await getActiveAdPlatforms(db);

  for (const platform of platforms) {
    const config: AdPlatformConfig = JSON.parse(platform.config);

    try {
      switch (platform.name) {
        case 'meta':
          if (ref.fbclid) {
            await sendMetaConversion(config, ref, eventName, eventValue);
            await logAdConversion(db, {
              platformId: platform.id, friendId, eventName,
              clickId: ref.fbclid, clickIdType: 'fbclid', status: 'sent',
            });
          }
          break;
        case 'x':
          if (ref.twclid) {
            await sendXConversion(config, ref, eventName, eventValue);
            await logAdConversion(db, {
              platformId: platform.id, friendId, eventName,
              clickId: ref.twclid, clickIdType: 'twclid', status: 'sent',
            });
          }
          break;
        case 'google':
          if (ref.gclid) {
            await sendGoogleConversion(config, ref, eventName, eventValue);
            await logAdConversion(db, {
              platformId: platform.id, friendId, eventName,
              clickId: ref.gclid, clickIdType: 'gclid', status: 'sent',
            });
          }
          break;
        case 'tiktok':
          if (ref.ttclid) {
            await sendTikTokConversion(config, ref, eventName, eventValue);
            await logAdConversion(db, {
              platformId: platform.id, friendId, eventName,
              clickId: ref.ttclid, clickIdType: 'ttclid', status: 'sent',
            });
          }
          break;
      }
    } catch (error) {
      await logAdConversion(db, {
        platformId: platform.id,
        friendId,
        eventName,
        clickId: ref.fbclid || ref.twclid || ref.gclid || ref.ttclid || '',
        clickIdType: platform.name,
        status: 'failed',
        errorMessage: String(error),
      });
    }
  }
}

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
      fbc: `fb.1.${fbcTimestamp}.${ref.fbclid}`,
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

async function sendMetaConversion(
  config: AdPlatformConfig,
  ref: RefTracking,
  eventName: string,
  eventValue?: number,
): Promise<void> {
  const url = `https://graph.facebook.com/v21.0/${config.pixel_id}/events`;

  const eventData = buildMetaEventData(ref, eventName, eventValue);

  const body: Record<string, unknown> = {
    data: [eventData],
    access_token: config.access_token,
  };

  if (config.test_event_code) {
    body.test_event_code = config.test_event_code;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Meta CAPI error: ${response.status} ${errorBody}`);
  }
}

async function sendXConversion(
  config: AdPlatformConfig,
  ref: RefTracking,
  eventName: string,
  eventValue?: number,
): Promise<void> {
  const url = 'https://ads-api.x.com/12/measurement/conversions';

  const body = {
    conversions: [{
      conversion_time: new Date().toISOString(),
      event_id: crypto.randomUUID(),
      identifiers: [{ twclid: ref.twclid }],
      conversion_id: config.pixel_id,
      event_name: eventName,
      ...(eventValue && { value: { currency: 'JPY', amount: String(eventValue) } }),
    }],
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // OAuth 1.0a signature required — placeholder for production implementation
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`X Conversion API error: ${response.status} ${errorBody}`);
  }
}

async function sendGoogleConversion(
  config: AdPlatformConfig,
  ref: RefTracking,
  eventName: string,
  eventValue?: number,
): Promise<void> {
  const url = `https://googleads.googleapis.com/v17/customers/${config.customer_id}:uploadClickConversions`;

  const body = {
    conversions: [{
      gclid: ref.gclid,
      conversion_action: `customers/${config.customer_id}/conversionActions/${config.conversion_action_id}`,
      conversion_date_time: new Date().toISOString().replace('Z', '+09:00'),
      ...(eventValue && { conversion_value: eventValue, currency_code: 'JPY' }),
    }],
    partial_failure: true,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.oauth_token}`,
      'developer-token': config.developer_token || '',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Google Ads API error: ${response.status} ${errorBody}`);
  }
}

async function sendTikTokConversion(
  config: AdPlatformConfig,
  ref: RefTracking,
  eventName: string,
  eventValue?: number,
): Promise<void> {
  const url = 'https://business-api.tiktok.com/open_api/v1.3/event/track/';

  const body = {
    pixel_code: config.pixel_code,
    event: eventName,
    event_id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    context: {
      user_agent: ref.user_agent || '',
      ip: ref.ip_address || '',
    },
    properties: {
      ...(ref.ttclid && { ttclid: ref.ttclid }),
      ...(eventValue && { currency: 'JPY', value: eventValue }),
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Access-Token': config.access_token || '',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`TikTok Events API error: ${response.status} ${errorBody}`);
  }
}
