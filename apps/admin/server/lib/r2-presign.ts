import { createHash, createHmac } from 'node:crypto';

/** RFC 3986 encoding used by SigV4 (encodeURIComponent leaves !'()* alone). */
const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const hmac = (key: Buffer | string, data: string) => createHmac('sha256', key).update(data).digest();

export interface PresignInput {
  method: string;
  /** https://host (no path) */
  origin: string;
  /** Request path, e.g. /bucket/p/KS-1/a.jpg (each segment is encoded here). */
  path: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  expiresSec: number;
  now?: Date;
}

/**
 * AWS Signature V4 presigned URL (query-string auth, UNSIGNED-PAYLOAD, only `host` signed).
 * Works for R2 (region "auto"). Whoever holds the URL can do exactly this method on exactly
 * this object until it expires, without ever seeing the secret key.
 */
export function presignUrl(i: PresignInput): string {
  const now = i.now ?? new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const day = amzDate.slice(0, 8);
  const scope = `${day}/${i.region}/s3/aws4_request`;
  const host = new URL(i.origin).host;
  const path = i.path.split('/').map((seg) => enc(decodeURIComponent(seg))).join('/');
  const params: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${i.accessKeyId}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(i.expiresSec),
    'X-Amz-SignedHeaders': 'host'
  };
  const query = Object.keys(params)
    .sort()
    .map((k) => `${enc(k)}=${enc(params[k] ?? '')}`)
    .join('&');
  const canonical = [i.method, path, query, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, createHash('sha256').update(canonical).digest('hex')].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${i.secretAccessKey}`, day), i.region), 's3'), 'aws4_request');
  const signature = createHmac('sha256', key).update(toSign).digest('hex');
  return `${i.origin}${path}?${query}&X-Amz-Signature=${signature}`;
}
