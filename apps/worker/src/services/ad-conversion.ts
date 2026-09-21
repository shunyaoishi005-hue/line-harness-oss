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
import { buildMetaEventData, postMetaEvent } from './meta-capi.js';
import { enqueueMetaLead, processMetaLeadOutbox } from './meta-lead-outbox.js';
export { buildMetaEventData } from './meta-capi.js';

export async function sendAdConversions(
  db: D1Database,
  friendId: string,
  eventName: string,
  eventValue?: number,
  eventTimeMs: number = Date.now(),
): Promise<void> {
  if (eventName === 'Lead') {
    await enqueueMetaLead(db, friendId, eventTimeMs);
    await processMetaLeadOutbox(db, { friendId });
  }
  const ref = await getRefTrackingWithClickIds(db, friendId);
  if (!ref) return;

  const platforms = await getActiveAdPlatforms(db);

  for (const platform of platforms) {
    const config: AdPlatformConfig = JSON.parse(platform.config);

    try {
      switch (platform.name) {
        case 'meta':
          if (eventName !== 'Lead' && (ref.fbclid || ref.fbc)) {
            await postMetaEvent(config, buildMetaEventData(ref, eventName, eventValue, eventTimeMs));
            await logAdConversion(db, {
              platformId: platform.id, friendId, eventName,
              clickId: ref.fbclid || ref.fbc || '', clickIdType: 'fbclid', status: 'sent',
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
