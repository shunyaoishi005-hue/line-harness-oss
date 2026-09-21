import { describe, expect, it } from 'vitest';
import type { RefTracking } from '@line-crm/db';
import { buildMetaEventData } from './ad-conversion';

// 2026-07-10T12:00:00.000+09:00 = 2026-07-10T03:00:00.000Z
const CLICK_AT = '2026-07-10T12:00:00.000+09:00';
const CLICK_EPOCH_MS = Date.parse(CLICK_AT);
// 友だち追加は広告クリックの2日後、という想定
const SEND_EPOCH_MS = CLICK_EPOCH_MS + 2 * 24 * 60 * 60 * 1000;

function refTracking(overrides: Partial<RefTracking> = {}): RefTracking {
  return {
    id: 'rt_1',
    ref_code: 'ref_lp',
    friend_id: 'friend_abc',
    entry_route_id: 'er_1',
    source_url: 'https://structure-partners.jp/',
    fbclid: 'IwAR_test_click_id',
    fbc: null,
    fbp: null,
    gclid: null,
    twclid: null,
    ttclid: null,
    utm_source: 'facebook',
    utm_medium: 'paid',
    utm_campaign: 'SP_VID01_Traffic_2026',
    user_agent: 'Mozilla/5.0 (iPhone)',
    ip_address: '203.0.113.10',
    created_at: CLICK_AT,
    ...overrides,
  };
}

describe('buildMetaEventData', () => {
  it('stamps fbc with the click time, not the send time', () => {
    const data = buildMetaEventData(refTracking(), 'Lead', undefined, SEND_EPOCH_MS);
    const userData = data.user_data as Record<string, unknown>;

    expect(userData.fbc).toBe(`fb.1.${CLICK_EPOCH_MS}.IwAR_test_click_id`);
    // event_time は「CVが起きた時刻」なので送信時刻でよい
    expect(data.event_time).toBe(Math.floor(SEND_EPOCH_MS / 1000));
  });

  it('falls back to the send time when created_at is unparseable', () => {
    const data = buildMetaEventData(
      refTracking({ created_at: 'not-a-date' }),
      'Lead',
      undefined,
      SEND_EPOCH_MS,
    );
    const userData = data.user_data as Record<string, unknown>;

    expect(userData.fbc).toBe(`fb.1.${SEND_EPOCH_MS}.IwAR_test_click_id`);
  });

  it('prefers the browser-issued fbc and forwards fbp for stronger matching', () => {
    const data = buildMetaEventData(
      refTracking({
        fbc: 'fb.1.1783642800000.browser_click_id',
        fbp: 'fb.1.1783642799000.123456789',
      }),
      'Lead',
      undefined,
      SEND_EPOCH_MS,
    );
    const userData = data.user_data as Record<string, unknown>;

    expect(userData.fbc).toBe('fb.1.1783642800000.browser_click_id');
    expect(userData.fbp).toBe('fb.1.1783642799000.123456789');
  });

  it('derives a stable event_id so webhook redelivery is deduped', () => {
    const first = buildMetaEventData(refTracking(), 'Lead', undefined, SEND_EPOCH_MS);
    const redelivered = buildMetaEventData(refTracking(), 'Lead', undefined, SEND_EPOCH_MS + 5000);

    expect(first.event_id).toBe('Lead:friend_abc');
    expect(redelivered.event_id).toBe(first.event_id);
  });

  it('keeps event_id distinct per event name', () => {
    const lead = buildMetaEventData(refTracking(), 'Lead', undefined, SEND_EPOCH_MS);
    const purchase = buildMetaEventData(refTracking(), 'Purchase', undefined, SEND_EPOCH_MS);

    expect(lead.event_id).not.toBe(purchase.event_id);
  });

  it('sends action_source website with event_source_url when the referrer is known', () => {
    const data = buildMetaEventData(refTracking(), 'Lead', undefined, SEND_EPOCH_MS);

    expect(data.action_source).toBe('website');
    expect(data.event_source_url).toBe('https://structure-partners.jp/');
  });

  it("falls back to action_source 'other' when there is no source_url", () => {
    // Meta は action_source: 'website' のとき event_source_url を必須にしている
    const data = buildMetaEventData(
      refTracking({ source_url: null }),
      'Lead',
      undefined,
      SEND_EPOCH_MS,
    );

    expect(data.action_source).toBe('other');
    expect(data).not.toHaveProperty('event_source_url');
  });

  it('falls back to the tracking row id when friend_id is missing', () => {
    const data = buildMetaEventData(
      refTracking({ friend_id: null }),
      'Lead',
      undefined,
      SEND_EPOCH_MS,
    );

    expect(data.event_id).toBe('Lead:rt_1');
  });

  it('omits custom_data unless a value is given', () => {
    const withoutValue = buildMetaEventData(refTracking(), 'Lead', undefined, SEND_EPOCH_MS);
    const withValue = buildMetaEventData(refTracking(), 'Lead', 1500, SEND_EPOCH_MS);

    expect(withoutValue).not.toHaveProperty('custom_data');
    expect(withValue.custom_data).toEqual({ currency: 'JPY', value: 1500 });
  });

  it('passes through IP and user agent for match quality', () => {
    const data = buildMetaEventData(refTracking(), 'Lead', undefined, SEND_EPOCH_MS);
    const userData = data.user_data as Record<string, unknown>;

    expect(userData.client_ip_address).toBe('203.0.113.10');
    expect(userData.client_user_agent).toBe('Mozilla/5.0 (iPhone)');
  });
});
