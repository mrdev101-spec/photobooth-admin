/** Thrown by services; server actions turn it into a message for the form. */
export class AppError extends Error {
  constructor(
    message: string,
    readonly code: 'not_found' | 'forbidden' | 'conflict' | 'invalid' | 'unauthenticated' = 'invalid',
    /** Per-field messages keyed by dotted path, shown next to the inputs. */
    readonly fieldErrors?: Record<string, string>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (what = 'ข้อมูล') => new AppError(`ไม่พบ${what}`, 'not_found');
export const forbidden = () => new AppError('คุณไม่มีสิทธิ์ทำรายการนี้', 'forbidden');

/** Duplicate key on MariaDB/MySQL (ER_DUP_ENTRY). */
export function isDuplicateKey(err: unknown): boolean {
  const e = err as { code?: string; errno?: number; cause?: { code?: string; errno?: number } };
  return e?.code === 'ER_DUP_ENTRY' || e?.errno === 1062 || e?.cause?.code === 'ER_DUP_ENTRY' || e?.cause?.errno === 1062;
}
