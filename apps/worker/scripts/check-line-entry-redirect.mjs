import { pathToFileURL } from 'node:url';

const DEFAULT_URL = process.env.LINE_ENTRY_SMOKE_URL || 'https://your-worker.example.workers.dev/r/ref_lp';
const DEFAULT_SMOKE_RT = 'line-entry-smoke';
const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const MAX_INTERNAL_REDIRECTS = Number(process.env.LINE_ENTRY_MAX_REDIRECTS || '6');
const SUCCESS_EXTERNAL_HOSTS = new Set([
  'access.line.me',
  'access-auto.line.me',
  'liff.line.me',
  'line.me',
]);

export function parseTargets(args = process.argv.slice(2), env = process.env) {
  const rawTargets = args.length > 0
    ? args
    : [
        env.LINE_ENTRY_SMOKE_URLS,
        env.LINE_ENTRY_URLS,
        env.LINE_ENTRY_SMOKE_URL,
        env.LINE_ENTRY_URL,
        DEFAULT_URL,
      ].find(Boolean);

  return (Array.isArray(rawTargets) ? rawTargets : [rawTargets])
    .filter(Boolean)
    .flatMap((value) => String(value).split(/[\s,]+/))
    .map((value) => value.trim())
    .filter(Boolean);
}

export function withSmokeTrackingParam(rawUrl, env = process.env) {
  if (env.LINE_ENTRY_SMOKE_RECORD_CLICKS === '1') return rawUrl;
  const smokeRt = env.LINE_ENTRY_SMOKE_RT || DEFAULT_SMOKE_RT;
  const url = new URL(rawUrl);
  if (!url.searchParams.has('rt')) {
    url.searchParams.set('rt', smokeRt);
  }
  return url.toString();
}

export function normalizeInternalUrl(url) {
  const copy = new URL(url);
  for (const key of ['rt', 'state', 'loginState']) {
    copy.searchParams.delete(key);
  }
  copy.searchParams.sort();
  return `${copy.origin}${copy.pathname}?${copy.searchParams.toString()}`;
}

export function isSuccessExternal(url) {
  return SUCCESS_EXTERNAL_HOSTS.has(url.hostname) || url.hostname.endsWith('.line.me');
}

export async function checkLineEntry(target, options = {}) {
  const maxInternalRedirects = options.maxInternalRedirects ?? MAX_INTERNAL_REDIRECTS;
  const fetchImpl = options.fetch ?? fetch;
  const startUrl = new URL(target);
  const seen = new Set([normalizeInternalUrl(startUrl)]);
  const chain = [];
  let current = startUrl;

  for (let step = 0; step <= maxInternalRedirects; step += 1) {
    const res = await fetchImpl(current, {
      redirect: 'manual',
      headers: {
        accept: 'text/html,*/*',
        'user-agent': MOBILE_UA,
      },
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) {
        throw Object.assign(new Error(`${current} returned ${res.status} without Location`), { chain });
      }

      const next = new URL(location, current);
      chain.push(`${res.status} ${current} -> ${next}`);

      if (next.origin !== startUrl.origin) {
        if (isSuccessExternal(next)) {
          return {
            status: 'external-line',
            target: startUrl.toString(),
            finalUrl: next.toString(),
            redirectCount: step + 1,
            chain,
          };
        }
        throw Object.assign(new Error(`unexpected external redirect destination: ${next}`), { chain });
      }

      const key = normalizeInternalUrl(next);
      if (seen.has(key)) {
        throw Object.assign(new Error(`internal redirect loop detected at ${next}`), { chain });
      }
      seen.add(key);
      current = next;
      continue;
    }

    if (res.status >= 200 && res.status < 300) {
      const body = await res.text();
      if (/liff\.line\.me|access\.line\.me|LINE/i.test(body)) {
        return {
          status: 'handoff-page',
          target: startUrl.toString(),
          finalUrl: current.toString(),
          redirectCount: chain.length,
          chain,
        };
      }
      throw Object.assign(
        new Error(`${current} returned ${res.status}, but the page does not look like a LINE handoff`),
        { chain },
      );
    }

    throw Object.assign(new Error(`${current} returned unexpected status ${res.status}`), { chain });
  }

  throw Object.assign(new Error(`exceeded ${maxInternalRedirects} internal redirects`), { chain });
}

async function main() {
  const targets = parseTargets();
  let failed = false;

  for (const rawTarget of targets) {
    const target = withSmokeTrackingParam(rawTarget);
    try {
      const result = await checkLineEntry(target);
      if (result.status === 'external-line') {
        console.log(`OK: ${target} reaches external LINE destination after ${result.redirectCount} redirect(s).`);
      } else {
        console.log(`OK: ${target} served a usable LINE handoff page at ${result.finalUrl}.`);
      }
      if (result.chain.length > 0) console.log(result.chain.join('\n'));
    } catch (err) {
      failed = true;
      console.error(`LINE entry smoke failed for ${target}: ${err.message}`);
      if (err.chain?.length > 0) {
        console.error('Redirect chain:');
        for (const item of err.chain) console.error(`  ${item}`);
      }
    }
  }

  if (failed) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

