import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseSync as DatabaseSyncType, SQLInputValue } from 'node:sqlite';
import { createRequire } from 'node:module';
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { enqueueMetaLead, processMetaLeadOutbox } from './meta-lead-outbox';
import { sendAdConversions } from './ad-conversion';
import { postMetaEvent } from './meta-capi';

let sqlite: DatabaseSyncType;
let db: D1Database;
let request: ReturnType<typeof vi.fn>;
const NOW = Date.parse('2026-09-13T00:00:00Z');
const FOLLOW = NOW - 2 * 60_000;
const config = { pixel_id: 'test-pixel', access_token: 'test-only-token' };

function wrapDb(database: DatabaseSyncType): D1Database {
  return {
    prepare(sql: string) {
      const build = (params: SQLInputValue[] = []) => ({
        bind: (...args: SQLInputValue[]) => build(args),
        async first() { return database.prepare(sql).get(...params) ?? null; },
        async all() { return { results: database.prepare(sql).all(...params), success: true, meta: {} }; },
        async run() { const r = database.prepare(sql).run(...params); return { results: [], success: true, meta: { changes: Number(r.changes) } }; },
      });
      return build();
    },
  } as unknown as D1Database;
}
function row() { return sqlite.prepare('SELECT * FROM meta_lead_outbox').get()!; }
function link(id='rt-1', at=FOLLOW-30_000, click='click-original') {
  sqlite.prepare(`INSERT INTO ref_tracking
    (id,ref_code,friend_id,source_url,fbclid,fbc,fbp,created_at)
    VALUES (?, 'ref_lp', 'friend-1', 'https://example.com/', ?, ?, ?, ?)`)
    .run(id, click, `fb.1.${at}.${click}`, 'fb.1.123.browser-1', new Date(at).toISOString());
}
function receipt(count=1) {
  return new Response(JSON.stringify({ events_received: count, fbtrace_id: 'trace-safe', messages: [] }), {status:200});
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../../../../packages/db/bootstrap.sql', import.meta.url), 'utf8'));
  sqlite.exec(readFileSync(new URL('../../../../packages/db/migrations/074_meta_lead_outbox.sql', import.meta.url), 'utf8'));
  sqlite.prepare("INSERT INTO friends (id,line_user_id,display_name) VALUES ('friend-1','line-test-1','Test')").run();
  sqlite.prepare("INSERT INTO ad_platforms (id,name,config,is_active) VALUES ('meta-1','meta',?,1)").run(JSON.stringify(config));
  db=wrapDb(sqlite);
  request=vi.fn().mockImplementation(async()=>receipt());
  vi.stubGlobal('fetch', request);
});
afterEach(() => { sqlite.close(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('durable Meta Lead delivery', () => {
  it('keeps a follow with no attribution pending, then sends after linkage', async () => {
    await enqueueMetaLead(db,'friend-1',FOLLOW);
    expect(await processMetaLeadOutbox(db)).toEqual({sent:0,pending:1,expired:0});
    expect(request).not.toHaveBeenCalled();
    expect(row().last_error).toBe('waiting_for_meta_attribution');
    link();
    await processMetaLeadOutbox(db,{now:NOW+60_000});
    expect(row().status).toBe('sent');
    const event=JSON.parse(request.mock.calls[0][1].body).data[0];
    expect(event.event_time).toBe(FOLLOW/1000);
    expect(event.event_id).toBe('Lead:friend-1');
    expect(event.user_data.fbp).toBe('fb.1.123.browser-1');
  });
  it('sends when attribution arrives before follow', async () => {
    link();
    await enqueueMetaLead(db,'friend-1',FOLLOW);
    await processMetaLeadOutbox(db);
    expect(row().status).toBe('sent');
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('the existing event service now persists a Lead even without a linked click', async () => {
    await sendAdConversions(db,'friend-1','Lead',undefined,FOLLOW);
    expect(row().event_time).toBe(FOLLOW/1000);
    expect(row().status).toBe('pending');
    expect(request).not.toHaveBeenCalled();
  });
  it('redelivery or unblock does not change the original time or send twice', async () => {
    link();
    await enqueueMetaLead(db,'friend-1',FOLLOW);
    await processMetaLeadOutbox(db);
    await enqueueMetaLead(db,'friend-1',NOW);
    await processMetaLeadOutbox(db,{now:NOW+60_000});
    expect(row().event_time).toBe(FOLLOW/1000);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('does not replay a successful send by the previous implementation', async () => {
    link();
    sqlite.prepare(`INSERT INTO ad_conversion_logs
      (id,ad_platform_id,friend_id,event_name,click_id,click_id_type,status)
      VALUES ('old','meta-1','friend-1','Lead','oldclick','fbclid','sent')`).run();
    await enqueueMetaLead(db,'friend-1',FOLLOW);
    await processMetaLeadOutbox(db);
    expect(request).not.toHaveBeenCalled();
    expect(row().response_summary).toBe('already_sent');
  });
  it('retries transient failures using identical payload even if a newer ref arrives', async () => {
    link();
    request.mockRejectedValueOnce(new Error('network failure test-only-token'));
    await enqueueMetaLead(db,'friend-1',FOLLOW);
    await processMetaLeadOutbox(db);
    expect(row().status).toBe('pending');
    expect(row().last_error).toBe('meta_delivery_failed');
    expect(JSON.stringify(row())).not.toContain('test-only-token');
    link('rt-new',FOLLOW-5_000,'new-click');
    await processMetaLeadOutbox(db,{now:NOW+60_000});
    expect(request.mock.calls[1][1].body).toBe(request.mock.calls[0][1].body);
    expect(row().status).toBe('sent');
  });
  it('rejects HTTP 200 with zero accepted events and records pending status', async () => {
    link(); request.mockImplementationOnce(async()=>receipt(0));
    await enqueueMetaLead(db,'friend-1',FOLLOW);
    await processMetaLeadOutbox(db);
    expect(row().status).toBe('pending');
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM ad_conversion_logs').get()!.n).toBe(0);
  });
  it('expires events older than 7 days instead of pretending they happened today', async () => {
    link();
    await enqueueMetaLead(db,'friend-1',NOW-7*86400_000);
    await processMetaLeadOutbox(db);
    expect(row().status).toBe('expired');
    expect(request).not.toHaveBeenCalled();
  });
  it('does not send a later click as the source of an earlier conversion', async () => {
    link('late',FOLLOW+60_000);
    await enqueueMetaLead(db,'friend-1',FOLLOW);
    await processMetaLeadOutbox(db);
    expect(row().last_error).toBe('waiting_for_meta_attribution');
    expect(request).not.toHaveBeenCalled();
  });
  it('does not let concurrent workers send the same lead', async () => {
    link(); await enqueueMetaLead(db,'friend-1',FOLLOW);
    await Promise.all([processMetaLeadOutbox(db),processMetaLeadOutbox(db)]);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('recovers an abandoned lease', async () => {
    link(); await enqueueMetaLead(db,'friend-1',FOLLOW);
    sqlite.prepare("UPDATE meta_lead_outbox SET status='processing',lease_token='crashed',next_attempt_at=?").run(NOW+120_000);
    await processMetaLeadOutbox(db);
    expect(request).not.toHaveBeenCalled();
    await processMetaLeadOutbox(db,{now:NOW+120_000});
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('keeps a paused platform pending and refuses a changed destination pixel', async () => {
    link(); await enqueueMetaLead(db,'friend-1',FOLLOW);
    sqlite.prepare("UPDATE ad_platforms SET is_active=0").run();
    await processMetaLeadOutbox(db);
    expect(row().last_error).toBe('platform_inactive');
    sqlite.prepare("UPDATE ad_platforms SET is_active=1,config=?").run(JSON.stringify({...config,pixel_id:'different'}));
    await processMetaLeadOutbox(db,{now:NOW+60_000});
    expect(row().last_error).toBe('pixel_changed');
    expect(request).not.toHaveBeenCalled();
  });
  it('never marks a test-mode delivery as a production conversion', async () => {
    link(); await enqueueMetaLead(db,'friend-1',FOLLOW);
    sqlite.prepare("UPDATE ad_platforms SET config=?").run(JSON.stringify({...config,test_event_code:'TEST'}));
    await processMetaLeadOutbox(db);
    expect(row().last_error).toBe('test_mode_enabled');
    expect(request).not.toHaveBeenCalled();
  });
  it('ignores non-Meta click rows without dropping a valid earlier Meta touch', async () => {
    link();
    sqlite.prepare("INSERT INTO ref_tracking (id,ref_code,friend_id,gclid,created_at) VALUES ('google','ref_lp','friend-1','g-test',?)")
      .run(new Date(FOLLOW-1_000).toISOString());
    await enqueueMetaLead(db,'friend-1',FOLLOW); await processMetaLeadOutbox(db);
    expect(row().status).toBe('sent');
  });
  it('retains safe acceptance evidence, not the access token', async () => {
    link(); await enqueueMetaLead(db,'friend-1',FOLLOW); await processMetaLeadOutbox(db);
    expect(JSON.parse(String(row().response_summary))).toEqual({events_received:1,fbtrace_id:'trace-safe',message_count:0});
    expect(JSON.stringify(sqlite.prepare('SELECT * FROM ad_conversion_logs').all())).not.toContain('test-only-token');
  });
  it('migration is rerunnable without losing a pending registration', async () => {
    await enqueueMetaLead(db,'friend-1',FOLLOW);
    sqlite.exec(readFileSync(new URL('../../../../packages/db/migrations/074_meta_lead_outbox.sql', import.meta.url),'utf8'));
    expect(row().event_time).toBe(FOLLOW/1000);
  });
  it('does not enqueue anything merely by visiting the LP (no follow)', async () => {
    link(); await processMetaLeadOutbox(db);
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM meta_lead_outbox').get()!.n).toBe(0);
    expect(request).not.toHaveBeenCalled();
  });
});
describe('Meta acceptance validation', () => {
  it('rejects errors without echoing the provider response', async () => {
    request.mockResolvedValueOnce(new Response(JSON.stringify({error:{code:190,message:'test-only-token'}}),{status:400}));
    await expect(postMetaEvent(config,{event_name:'Lead'})).rejects.toThrow('Meta CAPI rejected HTTP=400 code=190');
  });
});
