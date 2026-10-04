/**
 * Reads the size (and for PNG, whether it can be transparent) straight from the file header,
 * so uploads are checked without an image library.
 */
export interface ImageInfo {
  type: 'png' | 'jpeg';
  width: number;
  height: number;
  /** PNG with an alpha channel or a tRNS chunk. Always false for JPEG. */
  alpha: boolean;
}

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function imageInfo(buf: Uint8Array): ImageInfo | null {
  if (buf.length >= 33 && PNG_SIG.every((b, i) => buf[i] === b)) return pngInfo(buf);
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) return jpegInfo(buf);
  return null;
}

function pngInfo(buf: Uint8Array): ImageInfo | null {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // First chunk must be IHDR
  if (String.fromCharCode(...buf.subarray(12, 16)) !== 'IHDR') return null;
  const width = dv.getUint32(16);
  const height = dv.getUint32(20);
  const colorType = buf[25]!;
  let alpha = colorType === 4 || colorType === 6;
  // Palette / grey / RGB images can still be transparent through a tRNS chunk before IDAT
  let off = 8;
  while (!alpha && off + 8 <= buf.length) {
    const len = dv.getUint32(off);
    const type = String.fromCharCode(...buf.subarray(off + 4, off + 8));
    if (type === 'tRNS') alpha = true;
    if (type === 'IDAT' || type === 'IEND') break;
    off += 12 + len;
  }
  return width && height ? { type: 'png', width, height, alpha } : null;
}

function jpegInfo(buf: Uint8Array): ImageInfo | null {
  let off = 2;
  while (off + 9 < buf.length) {
    if (buf[off] !== 0xff) return null;
    const marker = buf[off + 1]!;
    const len = (buf[off + 2]! << 8) | buf[off + 3]!;
    // SOF0-SOF15 except DHT (C4), JPG (C8), DAC (CC)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = (buf[off + 5]! << 8) | buf[off + 6]!;
      const width = (buf[off + 7]! << 8) | buf[off + 8]!;
      return width && height ? { type: 'jpeg', width, height, alpha: false } : null;
    }
    off += 2 + len;
  }
  return null;
}
