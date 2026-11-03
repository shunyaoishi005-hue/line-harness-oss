import { describe, test, expect, vi } from 'vitest';
import { fetchAndStoreIncomingImage, fetchAndStoreIncomingFile, INCOMING_FILE_MAX_BYTES } from './incoming-image.js';

describe('fetchAndStoreIncomingFile', () => {
  const baseOpts = {
    workerUrl: 'https://worker.example.com/',
    channelAccessToken: 'token-abc',
    accountId: 'acc-1',
    messageId: 'msg-pdf',
  };

  test('PDF (application/pdf) を R2 に .pdf で保存し {fileName,url,size,contentType} を返す', async () => {
    const r2 = makeR2Stub();
    const fetchMock = vi.fn(async () =>
      new Response(new ArrayBuffer(1234), {
        status: 200,
        headers: { 'Content-Type': 'application/pdf', 'Content-Length': '1234' },
      }),
    );

    const result = await fetchAndStoreIncomingFile({
      ...baseOpts,
      r2: r2 as unknown as R2Bucket,
      fetch: fetchMock,
      fileName: 'ライフプラン.pdf',
      fileSize: 1234,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api-data.line.me/v2/bot/message/msg-pdf/content',
      expect.objectContaining({ headers: { Authorization: 'Bearer token-abc' } }),
    );
    const [key, , opts] = r2.put.mock.calls[0];
    expect(key).toBe('incoming-acc-1-msg-pdf.pdf');
    expect(opts.httpMetadata?.contentType).toBe('application/pdf');
    expect(result).toEqual({
      fileName: 'ライフプラン.pdf',
      url: 'https://worker.example.com/images/incoming-acc-1-msg-pdf.pdf',
      size: 1234,
      contentType: 'application/pdf',
    });
  });

  test('Content-Type が octet-stream でも拡張子 .pdf から PDF と判定する', async () => {
    const r2 = makeR2Stub();
    const fetchMock = vi.fn(async () =>
      new Response(new ArrayBuffer(10), {
        status: 200,
        headers: { 'Content-Type': 'application/octet-stream' },
      }),
    );

    const result = await fetchAndStoreIncomingFile({
      ...baseOpts,
      r2: r2 as unknown as R2Bucket,
      fetch: fetchMock,
      fileName: 'plan.PDF',
    });

    expect(r2.put.mock.calls[0][0]).toBe('incoming-acc-1-msg-pdf.pdf');
    expect(result?.contentType).toBe('application/pdf');
  });

  test('許可外の種別 (exe) は保存せず null', async () => {
    const r2 = makeR2Stub();
    const fetchMock = vi.fn(async () =>
      new Response(new ArrayBuffer(10), {
        status: 200,
        headers: { 'Content-Type': 'application/octet-stream' },
      }),
    );

    const result = await fetchAndStoreIncomingFile({
      ...baseOpts,
      r2: r2 as unknown as R2Bucket,
      fetch: fetchMock,
      fileName: 'setup.exe',
    });

    expect(result).toBeNull();
    expect(r2.put).not.toHaveBeenCalled();
  });

  test('declared fileSize が上限超えなら Content API を呼ばずに null', async () => {
    const r2 = makeR2Stub();
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));

    const result = await fetchAndStoreIncomingFile({
      ...baseOpts,
      r2: r2 as unknown as R2Bucket,
      fetch: fetchMock,
      fileName: 'big.pdf',
      fileSize: INCOMING_FILE_MAX_BYTES + 1,
    });

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('Content-Length が上限超えなら本文を読まずに null', async () => {
    const r2 = makeR2Stub();
    const fetchMock = vi.fn(async () =>
      new Response(new ArrayBuffer(10), {
        status: 200,
        headers: { 'Content-Type': 'application/pdf', 'Content-Length': String(INCOMING_FILE_MAX_BYTES + 1) },
      }),
    );

    const result = await fetchAndStoreIncomingFile({
      ...baseOpts,
      r2: r2 as unknown as R2Bucket,
      fetch: fetchMock,
      fileName: 'big.pdf',
    });

    expect(result).toBeNull();
    expect(r2.put).not.toHaveBeenCalled();
  });

  test('Content API が非 200 なら null', async () => {
    const r2 = makeR2Stub();
    const fetchMock = vi.fn(async () => new Response(null, { status: 404 }));

    const result = await fetchAndStoreIncomingFile({
      ...baseOpts,
      r2: r2 as unknown as R2Bucket,
      fetch: fetchMock,
      fileName: 'plan.pdf',
    });

    expect(result).toBeNull();
  });
});

function makeR2Stub() {
  const store = new Map<string, { data: ArrayBuffer; contentType: string }>();
  return {
    put: vi.fn(async (key: string, data: ArrayBuffer, opts: { httpMetadata?: { contentType?: string } }) => {
      store.set(key, { data, contentType: opts.httpMetadata?.contentType ?? '' });
      return null;
    }),
    _store: store,
  };
}

describe('fetchAndStoreIncomingImage', () => {
  test('Content API 成功時に R2 PUT して URL を返す', async () => {
    const r2 = makeR2Stub();
    const fetchMock = vi.fn(async () =>
      new Response(new ArrayBuffer(100), {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg' },
      }),
    );

    const result = await fetchAndStoreIncomingImage({
      r2: r2 as unknown as R2Bucket,
      fetch: fetchMock,
      workerUrl: 'https://worker.example.com',
      channelAccessToken: 'token-abc',
      accountId: 'acc-1',
      messageId: 'msg-xyz',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api-data.line.me/v2/bot/message/msg-xyz/content',
      expect.objectContaining({
        headers: { Authorization: 'Bearer token-abc' },
      }),
    );
    expect(r2.put).toHaveBeenCalled();
    const [key, , opts] = r2.put.mock.calls[0];
    expect(key).toBe('incoming-acc-1-msg-xyz.jpg');
    expect(opts.httpMetadata?.contentType).toBe('image/jpeg');
    expect(result?.originalContentUrl).toBe('https://worker.example.com/images/incoming-acc-1-msg-xyz.jpg');
    expect(result?.previewImageUrl).toBe(result?.originalContentUrl);
  });

  test('Content API が非 200 を返したら null', async () => {
    const r2 = makeR2Stub();
    const fetchMock = vi.fn(async () => new Response(null, { status: 401 }));

    const result = await fetchAndStoreIncomingImage({
      r2: r2 as unknown as R2Bucket,
      fetch: fetchMock,
      workerUrl: 'https://worker.example.com',
      channelAccessToken: 'token-bad',
      accountId: 'acc-1',
      messageId: 'msg-y',
    });

    expect(result).toBeNull();
    expect(r2.put).not.toHaveBeenCalled();
  });

  test('R2 PUT が throw したら null', async () => {
    const r2 = makeR2Stub();
    r2.put.mockRejectedValueOnce(new Error('R2 down'));
    const fetchMock = vi.fn(async () =>
      new Response(new ArrayBuffer(50), {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      }),
    );

    const result = await fetchAndStoreIncomingImage({
      r2: r2 as unknown as R2Bucket,
      fetch: fetchMock,
      workerUrl: 'https://worker.example.com',
      channelAccessToken: 'token-abc',
      accountId: 'acc-1',
      messageId: 'msg-z',
    });

    expect(result).toBeNull();
  });

  test('Content-Type から拡張子を判定 (png)', async () => {
    const r2 = makeR2Stub();
    const fetchMock = vi.fn(async () =>
      new Response(new ArrayBuffer(50), {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      }),
    );

    await fetchAndStoreIncomingImage({
      r2: r2 as unknown as R2Bucket,
      fetch: fetchMock,
      workerUrl: 'https://worker.example.com',
      channelAccessToken: 'token-abc',
      accountId: 'a',
      messageId: 'm-png',
    });

    const [key] = r2.put.mock.calls[0];
    expect(key).toBe('incoming-a-m-png.png');
  });
});
