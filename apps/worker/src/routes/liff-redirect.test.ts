import { describe, expect, test, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../index.js';

const dbMocks = {
  getFriendByLineUserId: vi.fn(),
  createUser: vi.fn(),
  getUserByEmail: vi.fn(),
  linkFriendToUser: vi.fn(),
  upsertFriend: vi.fn(),
  getEntryRouteByRefCode: vi.fn(),
  attachRefTrackingToFriend: vi.fn(),
  recordRefTracking: vi.fn(),
  addTagToFriend: vi.fn(),
  getLineAccountByChannelId: vi.fn(),
  getLineAccountById: vi.fn(),
  getLineAccounts: vi.fn(),
  getTrafficPoolBySlug: vi.fn(),
  getTrafficPoolById: vi.fn(),
  getRandomPoolAccount: vi.fn(),
  getPoolAccounts: vi.fn(),
  getTrackedLinkById: vi.fn(),
  getMessageTemplateById: vi.fn(),
  jstNow: vi.fn(() => '2026-06-15T00:00:00.000+09:00'),
};

vi.mock('@line-crm/db', () => dbMocks);

const { liffRoutes } = await import('./liff.js');

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const baseEnv: Env['Bindings'] = {
  DB: {} as D1Database,
  IMAGES: {} as R2Bucket,
  ASSETS: {} as Fetcher,
  LINE_CHANNEL_SECRET: 'test-secret',
  LINE_CHANNEL_ACCESS_TOKEN: 'test-token',
  API_KEY: 'test-api-key',
  LIFF_URL: '',
  LINE_CHANNEL_ID: '2007823129',
  LINE_LOGIN_CHANNEL_ID: '2010318309',
  LINE_LOGIN_CHANNEL_SECRET: 'test-login-secret',
  WORKER_URL: 'https://worker.example.com',
};

function setupApp(envOverrides: Partial<Env['Bindings']> = {}) {
  const app = new Hono<Env>();
  app.route('/', liffRoutes);
  const env = { ...baseEnv, ...envOverrides };
  return (path: string) =>
    app.request(
      path,
      { headers: { 'user-agent': MOBILE_UA } },
      env,
    );
}

function decodeState(location: string): Record<string, unknown> {
  const state = new URL(location).searchParams.get('state');
  if (!state) throw new Error('Missing state');
  return JSON.parse(Buffer.from(state, 'base64').toString('utf8')) as Record<string, unknown>;
}

beforeEach(() => {
  for (const fn of Object.values(dbMocks)) fn.mockReset();
  dbMocks.getEntryRouteByRefCode.mockResolvedValue(null);
  dbMocks.getTrafficPoolBySlug.mockResolvedValue(null);
  dbMocks.getTrafficPoolById.mockResolvedValue(null);
  dbMocks.getRandomPoolAccount.mockResolvedValue(null);
  dbMocks.getPoolAccounts.mockResolvedValue([]);
});

describe('GET /auth/line mobile redirect safety', () => {
  test('does not route back to /r when reached from /r fallback', async () => {
    const fetchApp = setupApp();

    const res = await fetchApp('/auth/line?ref=ref_lp&from=r&rt=rt-123');

    expect(res.status).toBe(302);
    const location = res.headers.get('location') || '';
    expect(location).toMatch(/^https:\/\/access\.line\.me\/oauth2\/v2\.1\/authorize/);
    expect(location).not.toContain('/r/ref_lp');
    expect(decodeState(location)).toMatchObject({ ref: 'ref_lp', rt: 'rt-123' });
  });

  test('keeps direct mobile /auth/line requests on the OS-aware /r landing page', async () => {
    const fetchApp = setupApp({
      LIFF_URL: 'https://liff.line.me/2000000000-AbCdEf',
    });

    const res = await fetchApp('/auth/line?ref=ref_lp');

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/r/ref_lp');
  });

  test('sends from-r requests with LIFF configured to LIFF instead of looping to /r', async () => {
    const fetchApp = setupApp({
      LIFF_URL: 'https://liff.line.me/2000000000-AbCdEf',
    });

    const res = await fetchApp('/auth/line?ref=ref_lp&from=r&rt=rt-456');

    expect(res.status).toBe(302);
    const location = res.headers.get('location') || '';
    expect(location).toMatch(/^https:\/\/liff\.line\.me\/2000000000-AbCdEf\?/);
    expect(location).toContain('ref=ref_lp');
    expect(location).toContain('rt=rt-456');
  });
});
