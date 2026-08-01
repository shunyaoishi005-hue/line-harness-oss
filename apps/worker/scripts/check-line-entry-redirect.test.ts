import { describe, expect, test, vi } from 'vitest';
import {
  checkLineEntry,
  normalizeInternalUrl,
  parseTargets,
  withSmokeTrackingParam,
} from './check-line-entry-redirect.mjs';

function redirect(location: string) {
  return new Response(null, { status: 302, headers: { location } });
}

describe('check-line-entry-redirect', () => {
  test('parses multiple targets from args and env fallbacks', () => {
    expect(parseTargets(['https://a.test/r/a', 'https://b.test/r/b,https://c.test/r/c'])).toEqual([
      'https://a.test/r/a',
      'https://b.test/r/b',
      'https://c.test/r/c',
    ]);

    expect(parseTargets([], { LINE_ENTRY_SMOKE_URLS: 'https://a.test/r/a\nhttps://b.test/r/b' })).toEqual([
      'https://a.test/r/a',
      'https://b.test/r/b',
    ]);
  });

  test('adds an rt parameter so smoke tests do not write click tracking rows', () => {
    expect(withSmokeTrackingParam('https://worker.test/r/ref_lp')).toBe(
      'https://worker.test/r/ref_lp?rt=line-entry-smoke',
    );
    expect(withSmokeTrackingParam('https://worker.test/r/ref_lp?rt=existing')).toBe(
      'https://worker.test/r/ref_lp?rt=existing',
    );
    expect(withSmokeTrackingParam('https://worker.test/r/ref_lp', {
      LINE_ENTRY_SMOKE_RECORD_CLICKS: '1',
    })).toBe('https://worker.test/r/ref_lp');
  });

  test('normalizes volatile redirect params before loop detection', () => {
    expect(normalizeInternalUrl(new URL('https://worker.test/auth/line?rt=a&state=b&ref=lp'))).toBe(
      'https://worker.test/auth/line?ref=lp',
    );
  });

  test('detects internal /r <-> /auth loops', async () => {
    const fetchImpl = vi.fn(async (input: URL) => {
      const url = new URL(String(input));
      if (url.pathname === '/r/ref_lp') return redirect('/auth/line?ref=ref_lp&rt=one');
      if (url.pathname === '/auth/line') return redirect('/r/ref_lp?rt=two');
      return new Response('unexpected', { status: 500 });
    });

    await expect(
      checkLineEntry('https://worker.test/r/ref_lp?rt=start', { fetch: fetchImpl }),
    ).rejects.toThrow(/internal redirect loop detected/);
  });

  test('accepts handoff to LINE external hosts', async () => {
    const fetchImpl = vi.fn(async (input: URL) => {
      const url = new URL(String(input));
      if (url.pathname === '/r/ref_lp') return redirect('/auth/line?ref=ref_lp&from=r&rt=one');
      if (url.pathname === '/auth/line') return redirect('https://access.line.me/oauth2/v2.1/authorize');
      return new Response('unexpected', { status: 500 });
    });

    const result = await checkLineEntry('https://worker.test/r/ref_lp?rt=start', { fetch: fetchImpl });

    expect(result.status).toBe('external-line');
    expect(result.redirectCount).toBe(2);
  });
});
