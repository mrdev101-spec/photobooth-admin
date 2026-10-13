import 'server-only';
import { AppError } from '@/server/lib/errors';

/**
 * Sends a transactional email through Resend (RESEND_API_KEY, EMAIL_FROM such as
 * "SCLUO-DIO <no-reply@your-domain>"). On a development machine without a key the message is
 * written to the server log instead, so sign-in codes can still be tried locally.
 */
export async function sendEmail(msg: { to: string; subject: string; text: string; html?: string }): Promise<void> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!key || !from) {
    if (process.env.NODE_ENV === 'production') throw new AppError('ระบบส่งอีเมลยังไม่ได้ตั้งค่า กรุณาติดต่อผู้ดูแลแพลตฟอร์ม');
    console.info(`[email:dev] to=${msg.to} subject="${msg.subject}"\n${msg.text}`);
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, text: msg.text, ...(msg.html ? { html: msg.html } : {}) }),
    signal: AbortSignal.timeout(15000)
  }).catch(() => null);
  if (!res || !res.ok) {
    console.error('[email] send failed', res?.status, res ? (await res.text().catch(() => '')).slice(0, 300) : 'network');
    throw new AppError('ส่งอีเมลไม่สำเร็จ ลองใหม่อีกครั้ง');
  }
}
