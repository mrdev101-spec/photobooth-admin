import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { imageInfo } from './image-info';

function crc32(buf: Buffer) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(width: number, height: number, colorType: number, extra: Buffer[] = []) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    ...extra,
    chunk('IDAT', deflateSync(Buffer.alloc(1))),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

describe('imageInfo', () => {
  it('reads PNG size and alpha', () => {
    expect(imageInfo(png(1200, 1800, 6))).toEqual({ type: 'png', width: 1200, height: 1800, alpha: true });
    expect(imageInfo(png(1000, 1000, 2))).toEqual({ type: 'png', width: 1000, height: 1000, alpha: false });
    expect(imageInfo(png(576, 900, 3, [chunk('PLTE', Buffer.alloc(3)), chunk('tRNS', Buffer.from([0]))]))?.alpha).toBe(true);
  });

  it('reads JPEG size', () => {
    const jpg = readFileSync(join(__dirname, '../../public/catalog/photo-4x6/full.jpg'));
    expect(imageInfo(jpg)).toEqual({ type: 'jpeg', width: 480, height: 720, alpha: false });
  });

  it('rejects other files', () => {
    expect(imageInfo(Buffer.from('GIF89a........'))).toBeNull();
    expect(imageInfo(Buffer.from('<svg></svg>'))).toBeNull();
  });
});
