const LINE_CONTENT_API_BASE = 'https://api-data.line.me/v2/bot/message';

const CONTENT_TYPE_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

export interface FetchAndStoreOptions {
  r2: R2Bucket;
  /** workers 環境では globalThis.fetch を使う。テスト時に注入する。 */
  fetch?: typeof fetch;
  /** 公開 URL のベース (例: https://your-worker.your-subdomain.workers.dev) */
  workerUrl: string;
  channelAccessToken: string;
  accountId: string;
  messageId: string;
}

export interface IncomingImageRefs {
  originalContentUrl: string;
  previewImageUrl: string;
}

/**
 * LINE Content API から incoming 画像バイナリを取得し R2 に保存して URL を返す。
 * 失敗時は null を返し、呼び出し元は `[画像]` ラベルフォールバックを使う。
 */
export async function fetchAndStoreIncomingImage(
  opts: FetchAndStoreOptions,
): Promise<IncomingImageRefs | null> {
  const fetcher = opts.fetch ?? fetch;

  let res: Response;
  try {
    res = await fetcher(`${LINE_CONTENT_API_BASE}/${opts.messageId}/content`, {
      headers: { Authorization: `Bearer ${opts.channelAccessToken}` },
    });
  } catch (err) {
    console.error('incoming-image: fetch failed', { err, messageId: opts.messageId, accountId: opts.accountId });
    return null;
  }

  if (!res.ok) {
    console.error('incoming-image: non-200', { status: res.status, messageId: opts.messageId, accountId: opts.accountId });
    return null;
  }

  const contentType = res.headers.get('Content-Type')?.split(';')[0].trim() ?? 'application/octet-stream';
  const ext = CONTENT_TYPE_TO_EXT[contentType];
  if (!ext) {
    console.error('incoming-image: unsupported content-type', { contentType, messageId: opts.messageId, accountId: opts.accountId });
    return null;
  }
  // accountId / messageId は実質 UUID / LINE 数字 ID で安全だが、念のため
  // R2 キーに不正な文字（スラッシュ等）が混入しないよう sanitize する。
  const safeAccountId = opts.accountId.replace(/[^a-zA-Z0-9-]/g, '_');
  const safeMessageId = opts.messageId.replace(/[^a-zA-Z0-9-]/g, '_');
  const key = `incoming-${safeAccountId}-${safeMessageId}.${ext}`;

  let data: ArrayBuffer;
  try {
    data = await res.arrayBuffer();
  } catch (err) {
    console.error('incoming-image: arrayBuffer failed', { err, messageId: opts.messageId, accountId: opts.accountId });
    return null;
  }

  try {
    await opts.r2.put(key, data, { httpMetadata: { contentType } });
  } catch (err) {
    console.error('incoming-image: R2 put failed', { err, messageId: opts.messageId, accountId: opts.accountId });
    return null;
  }

  const base = opts.workerUrl.replace(/\/$/, '');
  const url = `${base}/images/${key}`;
  return { originalContentUrl: url, previewImageUrl: url };
}

// ---------------------------------------------------------------------------
// 受信ファイル (LINE `file` メッセージ: PDF 等)
// ---------------------------------------------------------------------------

/** 受信ファイルとして保存を許可する拡張子 → Content-Type。 */
const FILE_EXT_TO_CONTENT_TYPE: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  heic: 'image/heic',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

const CONTENT_TYPE_TO_FILE_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/heic': 'heic',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

/** Worker のメモリに載せる上限。超えたらラベルフォールバック。 */
export const INCOMING_FILE_MAX_BYTES = 20 * 1024 * 1024;

export interface FetchAndStoreFileOptions extends FetchAndStoreOptions {
  /** LINE webhook の message.fileName */
  fileName?: string;
  /** LINE webhook の message.fileSize (bytes) */
  fileSize?: number;
}

export interface IncomingFileRefs {
  fileName: string;
  url: string;
  size: number;
  contentType: string;
}

/**
 * LINE Content API から incoming ファイル (PDF 等) のバイナリを取得し R2 に保存して
 * `{ fileName, url, size, contentType }` を返す。失敗時は null を返し、呼び出し元は
 * `[ファイル: 名前]` ラベルフォールバックを使う。
 *
 * Content-Type はまず Content API のヘッダで判定し、`application/octet-stream` 等で
 * 判定できないときは fileName の拡張子で補う。許可外の種別は保存しない。
 */
export async function fetchAndStoreIncomingFile(
  opts: FetchAndStoreFileOptions,
): Promise<IncomingFileRefs | null> {
  const fetcher = opts.fetch ?? fetch;
  const fileName = (opts.fileName ?? '').trim() || 'file';
  const extFromName = fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : '';
  const logCtx = { messageId: opts.messageId, accountId: opts.accountId, fileName };

  if (opts.fileSize !== undefined && opts.fileSize > INCOMING_FILE_MAX_BYTES) {
    console.error('incoming-file: declared fileSize exceeds limit', { ...logCtx, fileSize: opts.fileSize });
    return null;
  }

  let res: Response;
  try {
    res = await fetcher(`${LINE_CONTENT_API_BASE}/${opts.messageId}/content`, {
      headers: { Authorization: `Bearer ${opts.channelAccessToken}` },
    });
  } catch (err) {
    console.error('incoming-file: fetch failed', { err, ...logCtx });
    return null;
  }

  if (!res.ok) {
    console.error('incoming-file: non-200', { status: res.status, ...logCtx });
    return null;
  }

  const headerType = res.headers.get('Content-Type')?.split(';')[0].trim() ?? '';
  let ext = CONTENT_TYPE_TO_FILE_EXT[headerType] ?? '';
  let contentType = headerType;
  if (!ext && FILE_EXT_TO_CONTENT_TYPE[extFromName]) {
    ext = extFromName;
    contentType = FILE_EXT_TO_CONTENT_TYPE[extFromName];
  }
  if (!ext) {
    console.error('incoming-file: unsupported content-type', { contentType: headerType, ...logCtx });
    return null;
  }

  const declaredLength = Number(res.headers.get('Content-Length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > INCOMING_FILE_MAX_BYTES) {
    console.error('incoming-file: Content-Length exceeds limit', { declaredLength, ...logCtx });
    return null;
  }

  let data: ArrayBuffer;
  try {
    data = await res.arrayBuffer();
  } catch (err) {
    console.error('incoming-file: arrayBuffer failed', { err, ...logCtx });
    return null;
  }
  if (data.byteLength > INCOMING_FILE_MAX_BYTES) {
    console.error('incoming-file: body exceeds limit', { byteLength: data.byteLength, ...logCtx });
    return null;
  }

  const safeAccountId = opts.accountId.replace(/[^a-zA-Z0-9-]/g, '_');
  const safeMessageId = opts.messageId.replace(/[^a-zA-Z0-9-]/g, '_');
  const key = `incoming-${safeAccountId}-${safeMessageId}.${ext}`;

  try {
    await opts.r2.put(key, data, { httpMetadata: { contentType } });
  } catch (err) {
    console.error('incoming-file: R2 put failed', { err, ...logCtx });
    return null;
  }

  const base = opts.workerUrl.replace(/\/$/, '');
  return { fileName, url: `${base}/images/${key}`, size: data.byteLength, contentType };
}
