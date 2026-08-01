import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent } from './event-bus.js';

interface CapturedInsert {
  sql: string;
  binds: unknown[];
}

function fakeDb(opts: {
  friend?: { line_user_id: string };
  friendTagIds?: string[];
  capturedInserts: CapturedInsert[];
}): D1Database {
  return {
    prepare(sql: string) {
      let boundArgs: unknown[] = [];
      return {
        bind(...args: unknown[]) {
          boundArgs = args;
          if (sql.includes('INSERT INTO messages_log')) {
            opts.capturedInserts.push({ sql, binds: args });
          }
          return this;
        },
        async all<T>(): Promise<{ results: T[] }> {
          return { results: [] };
        },
        async first<T>(): Promise<T | null> {
          if (sql.includes('FROM friends WHERE id')) {
            return (opts.friend ?? null) as T | null;
          }
          if (sql.includes('FROM friend_tags')) {
            const requestedTagIds = boundArgs.slice(1).filter((v): v is string => typeof v === 'string');
            const friendTagIds = new Set(opts.friendTagIds ?? []);
            const count = requestedTagIds.filter((tagId) => friendTagIds.has(tagId)).length;
            return { count } as T;
          }
          return null;
        },
        async run(): Promise<{ success: true }> {
          return { success: true };
        },
      };
    },
  } as unknown as D1Database;
}

vi.mock('@line-crm/db', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@line-crm/db');
  return {
    ...actual,
    getActiveOutgoingWebhooksByEvent: vi.fn().mockResolvedValue([]),
    applyScoring: vi.fn().mockResolvedValue(undefined),
    getActiveAutomationsByEvent: vi.fn(),
    createAutomationLog: vi.fn().mockResolvedValue(undefined),
    getActiveNotificationRulesByEvent: vi.fn().mockResolvedValue([]),
    createNotification: vi.fn().mockResolvedValue(undefined),
    addTagToFriend: vi.fn().mockResolvedValue(undefined),
    removeTagFromFriend: vi.fn().mockResolvedValue(undefined),
    enrollFriendInScenario: vi.fn().mockResolvedValue(undefined),
    jstNow: () => '2026-05-08T00:00:00.000+09:00',
    getFriendScore: vi.fn().mockResolvedValue(0),
    getTemplateById: vi.fn().mockResolvedValue(null),
  };
});

vi.mock('@line-crm/line-sdk', () => {
  return {
    LineClient: vi.fn().mockImplementation(() => ({
      replyMessage: vi.fn().mockResolvedValue(undefined),
      pushMessage: vi.fn().mockResolvedValue(undefined),
    })),
  };
});

vi.mock('./ad-conversion.js', () => ({
  sendAdConversions: vi.fn().mockResolvedValue(undefined),
}));

describe('fireEvent — send_message action logging', () => {
  let captured: CapturedInsert[];

  beforeEach(async () => {
    captured = [];
    const db = await import('@line-crm/db');
    (db.getActiveAutomationsByEvent as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue([
      {
        id: 'auto-1',
        line_account_id: 'acc-1',
        conditions: JSON.stringify({ keyword: 'コスト比較' }),
        actions: JSON.stringify([
          {
            type: 'send_message',
            params: {
              messageType: 'flex',
              content: '{"type":"bubble","body":{"type":"box","layout":"vertical","contents":[{"type":"text","text":"hi"}]}}',
              altText: 'hi',
            },
          },
        ]),
      },
    ]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('logs flex outgoing message to messages_log when send_message fires via reply', async () => {
    const db = fakeDb({
      friend: { line_user_id: 'U_test' },
      capturedInserts: captured,
    });
    await fireEvent(
      db,
      'message_received',
      {
        friendId: 'friend-1',
        eventData: { text: 'コスト比較', matched: true },
        replyToken: 'reply-token-xyz',
      },
      'channel-token',
      'acc-1',
    );

    expect(captured).toHaveLength(1);
    const insert = captured[0];
    expect(insert.sql).toContain('INSERT INTO messages_log');
    // bind order: id, friendId, messageType, content, deliveryType, source, lineAccountId, createdAt
    expect(insert.binds[1]).toBe('friend-1');
    expect(insert.binds[2]).toBe('flex');
    expect(insert.binds[4]).toBe('reply');
    expect(insert.binds[5]).toBe('automation');
    expect(insert.binds[6]).toBe('acc-1');
  });

  it('logs delivery_type=push when no replyToken provided', async () => {
    const db = fakeDb({
      friend: { line_user_id: 'U_test' },
      capturedInserts: captured,
    });
    await fireEvent(
      db,
      'message_received',
      {
        friendId: 'friend-1',
        eventData: { text: 'コスト比較', matched: true },
      },
      'channel-token',
      'acc-1',
    );

    expect(captured).toHaveLength(1);
    expect(captured[0].binds[4]).toBe('push');
  });

  it('logs even when text message (not flex) is sent', async () => {
    const db = await import('@line-crm/db');
    (db.getActiveAutomationsByEvent as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue([
      {
        id: 'auto-2',
        line_account_id: null,
        conditions: JSON.stringify({}),
        actions: JSON.stringify([
          {
            type: 'send_message',
            params: { messageType: 'text', content: 'hello' },
          },
        ]),
      },
    ]);

    const dbFake = fakeDb({
      friend: { line_user_id: 'U_test' },
      capturedInserts: captured,
    });
    await fireEvent(
      dbFake,
      'tag_added',
      { friendId: 'friend-1', eventData: {} },
      'channel-token',
      null,
    );

    expect(captured).toHaveLength(1);
    expect(captured[0].binds[2]).toBe('text');
    expect(captured[0].binds[3]).toBe('hello');
    expect(captured[0].binds[6]).toBe(null);
  });

  it('resolves params.template_id via templates table when set', async () => {
    const db = await import('@line-crm/db');
    (db.getActiveAutomationsByEvent as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue([
      {
        id: 'auto-tpl',
        line_account_id: null,
        conditions: JSON.stringify({}),
        actions: JSON.stringify([
          {
            type: 'send_message',
            params: {
              template_id: 'tpl-1',
              // content / messageType を空にして template 経由 resolve を強制
            },
          },
        ]),
      },
    ]);
    (db.getTemplateById as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
      id: 'tpl-1',
      name: 'test-tpl',
      category: 'general',
      message_type: 'flex',
      message_content: '{"type":"bubble","body":{"type":"box","layout":"vertical","contents":[{"type":"text","text":"from-template"}]}}',
      created_at: '2026-05-08T00:00:00.000+09:00',
      updated_at: '2026-05-08T00:00:00.000+09:00',
    });

    const dbFake = fakeDb({
      friend: { line_user_id: 'U_test' },
      capturedInserts: captured,
    });
    await fireEvent(
      dbFake,
      'manual_test',
      { friendId: 'friend-1', eventData: {} },
      'channel-token',
      null,
    );

    expect(captured).toHaveLength(1);
    // log には template から取得した messageType / content が記録される
    expect(captured[0].binds[2]).toBe('flex');
    expect(String(captured[0].binds[3])).toContain('from-template');
  });

  it('matches automations only when all has_tag_ids are attached to the friend', async () => {
    const db = await import('@line-crm/db');
    (db.getActiveAutomationsByEvent as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue([
      {
        id: 'auto-tags',
        line_account_id: null,
        conditions: JSON.stringify({
          keyword_exact: '診断Q4:副業案件',
          has_tag_ids: ['hours-under-5', 'skill-cad'],
        }),
        actions: JSON.stringify([
          {
            type: 'send_message',
            params: { messageType: 'text', content: 'CAD向け案件です' },
          },
        ]),
      },
    ]);

    const dbFake = fakeDb({
      friend: { line_user_id: 'U_test' },
      friendTagIds: ['hours-under-5', 'skill-cad'],
      capturedInserts: captured,
    });
    await fireEvent(
      dbFake,
      'message_received',
      { friendId: 'friend-1', eventData: { text: '診断Q4:副業案件' } },
      'channel-token',
      null,
    );

    expect(captured).toHaveLength(1);
    expect(captured[0].binds[3]).toBe('CAD向け案件です');
  });

  it('skips automations when a required has_tag_ids value is missing', async () => {
    const db = await import('@line-crm/db');
    (db.getActiveAutomationsByEvent as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue([
      {
        id: 'auto-tags-missing',
        line_account_id: null,
        conditions: JSON.stringify({
          keyword_exact: '診断Q4:副業案件',
          has_tag_ids: ['hours-under-5', 'skill-cad'],
        }),
        actions: JSON.stringify([
          {
            type: 'send_message',
            params: { messageType: 'text', content: 'CAD向け案件です' },
          },
        ]),
      },
    ]);

    const dbFake = fakeDb({
      friend: { line_user_id: 'U_test' },
      friendTagIds: ['hours-under-5'],
      capturedInserts: captured,
    });
    await fireEvent(
      dbFake,
      'message_received',
      { friendId: 'friend-1', eventData: { text: '診断Q4:副業案件' } },
      'channel-token',
      null,
    );

    expect(captured).toHaveLength(0);
  });

  it('skips automations when a missing_tag_ids value is attached', async () => {
    const db = await import('@line-crm/db');
    (db.getActiveAutomationsByEvent as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue([
      {
        id: 'auto-missing-tags',
        line_account_id: null,
        conditions: JSON.stringify({
          keyword_exact: '診断Q4:副業案件',
          missing_tag_ids: ['already-sent'],
        }),
        actions: JSON.stringify([
          {
            type: 'send_message',
            params: { messageType: 'text', content: '初回だけ送る案件です' },
          },
        ]),
      },
    ]);

    const dbFake = fakeDb({
      friend: { line_user_id: 'U_test' },
      friendTagIds: ['already-sent'],
      capturedInserts: captured,
    });
    await fireEvent(
      dbFake,
      'message_received',
      { friendId: 'friend-1', eventData: { text: '診断Q4:副業案件' } },
      'channel-token',
      null,
    );

    expect(captured).toHaveLength(0);
  });
  it('splits text automation messages on {{line_split}} before sending and logging', async () => {
    const db = await import('@line-crm/db');
    (db.getActiveAutomationsByEvent as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue([
      {
        id: 'auto-line-split',
        line_account_id: null,
        conditions: JSON.stringify({ keyword: '無料面談' }),
        actions: JSON.stringify([
          {
            type: 'send_message',
            params: {
              messageType: 'text',
              content: '予約はこちらです\n{{line_split}}\nSP-ABC123\n{{line_split}}\n予約できたら「予約完了」と送ってください。',
            },
          },
        ]),
      },
    ]);

    const dbFake = fakeDb({
      friend: { line_user_id: 'U_test' },
      capturedInserts: captured,
    });
    await fireEvent(
      dbFake,
      'message_received',
      { friendId: 'friend-1', eventData: { text: '無料面談' }, replyToken: 'reply-token-xyz' },
      'channel-token',
      null,
    );

    expect(captured).toHaveLength(3);
    expect(captured.map((row) => row.binds[3])).toEqual([
      '予約はこちらです',
      'SP-ABC123',
      '予約できたら「予約完了」と送ってください。',
    ]);
    expect(captured.some((row) => String(row.binds[3]).includes('{{line_split}}'))).toBe(false);
  });

  it('treats natural reschedule wording as the 日程変更 automation keyword', async () => {
    const db = await import('@line-crm/db');
    (db.getActiveAutomationsByEvent as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue([
      {
        id: 'auto-reschedule',
        line_account_id: null,
        conditions: JSON.stringify({ keyword: '日程変更' }),
        actions: JSON.stringify([
          {
            type: 'send_message',
            params: { messageType: 'text', content: '日程変更のご連絡ありがとうございます。再予約はこちらです。' },
          },
        ]),
      },
    ]);

    const dbFake = fakeDb({
      friend: { line_user_id: 'U_test' },
      capturedInserts: captured,
    });
    await fireEvent(
      dbFake,
      'message_received',
      {
        friendId: 'friend-1',
        eventData: { text: '申し訳ございません。17時半からの面談につきましては時間に間に合わない為日程を変更させてください。' },
      },
      'channel-token',
      null,
    );

    expect(captured).toHaveLength(1);
    expect(captured[0].binds[3]).toBe('日程変更のご連絡ありがとうございます。再予約はこちらです。');
  });
});
