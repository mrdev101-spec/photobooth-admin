import { describe, expect, it } from 'vitest';
import { presignUrl } from './r2-presign';

describe('presignUrl', () => {
  it('matches the AWS SigV4 documentation example (presigned GET)', () => {
    // docs.aws.amazon.com AmazonS3 "Authenticating Requests: Using Query Parameters" example
    const url = presignUrl({
      method: 'GET',
      origin: 'https://examplebucket.s3.amazonaws.com',
      path: '/test.txt',
      region: 'us-east-1',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      expiresSec: 86400,
      now: new Date('2013-05-24T00:00:00Z')
    });
    expect(url).toContain('X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404');
  });
  it('encodes each key segment but keeps the slashes', () => {
    const url = presignUrl({ method: 'PUT', origin: 'https://acc.r2.cloudflarestorage.com', path: '/bucket/p/KS-1/a b.jpg', region: 'auto', accessKeyId: 'k', secretAccessKey: 's', expiresSec: 600 });
    expect(url.startsWith('https://acc.r2.cloudflarestorage.com/bucket/p/KS-1/a%20b.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256')).toBe(true);
  });
});
