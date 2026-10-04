import 'server-only';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

export interface R2Credentials {
  accountId: string;
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export function r2Endpoint(c: Pick<R2Credentials, 'accountId' | 'endpoint'>): string {
  return c.endpoint || `https://${c.accountId}.r2.cloudflarestorage.com`;
}

export function r2Client(c: R2Credentials): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: r2Endpoint(c),
    credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
    maxAttempts: 2
  });
}

/**
 * Proves the credentials can write, read and delete in the bucket, the same operations the
 * kiosk needs. Uses a key outside `p/` so the photo lifecycle rule is irrelevant.
 */
export async function testR2(c: R2Credentials): Promise<{ ok: true } | { ok: false; error: string }> {
  const client = r2Client(c);
  const key = `_admin-test/${Date.now()}-${Math.random().toString(36).slice(2)}.txt`;
  const body = `photobooth admin connection test ${new Date().toISOString()}`;
  try {
    await client.send(new PutObjectCommand({ Bucket: c.bucket, Key: key, Body: body, ContentType: 'text/plain' }));
    const got = await client.send(new GetObjectCommand({ Bucket: c.bucket, Key: key }));
    const text = await got.Body?.transformToString();
    if (text !== body) return { ok: false, error: 'อ่านไฟล์ทดสอบกลับมาไม่ตรงกับที่เขียน' };
    await client.send(new DeleteObjectCommand({ Bucket: c.bucket, Key: key }));
    return { ok: true };
  } catch (err) {
    const e = err as { name?: string; code?: string; message?: string; cause?: { code?: string }; $metadata?: { httpStatusCode?: number } };
    const status = e.$metadata?.httpStatusCode;
    const netCode = e.code ?? e.cause?.code;
    const hint =
      status === 403 || e.name === 'AccessDenied' || e.name === 'InvalidAccessKeyId' || e.name === 'SignatureDoesNotMatch'
        ? 'Key ไม่ถูกต้อง หรือไม่มีสิทธิ์ใน bucket นี้'
        : e.name === 'NoSuchBucket' || status === 404
          ? 'ไม่พบ bucket'
          : netCode === 'ENOTFOUND' || netCode === 'EAI_AGAIN' || netCode === 'EPROTO' || netCode === 'CERT_HAS_EXPIRED' || netCode === 'ERR_TLS_CERT_ALTNAME_INVALID'
            ? 'ไม่พบ endpoint ของ R2 (ตรวจ Account ID หรือ Endpoint)'
            : netCode === 'ETIMEDOUT' || netCode === 'ECONNREFUSED' || netCode === 'ECONNRESET'
              ? 'เชื่อมต่อ R2 ไม่ได้ (เครือข่าย)'
              : 'เชื่อมต่อ R2 ไม่ได้';
    const detail = [e.name && e.name !== 'Error' ? e.name : null, netCode, status].filter(Boolean).join(' ') || (e.message ?? 'Error').slice(0, 120);
    return { ok: false, error: `${hint} (${detail})` };
  } finally {
    client.destroy();
  }
}
