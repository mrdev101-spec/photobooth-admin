'use client';

/**
 * Last-resort boundary (an error in the root layout). It replaces the whole document, so it
 * carries its own minimal styles instead of the app's.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="th">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#faf8f6', color: '#1f1b16' }}>
        <title>เกิดข้อผิดพลาด</title>
        <main style={{ maxWidth: 480, margin: '0 auto', padding: '80px 16px', textAlign: 'center' }}>
          <h1 style={{ fontSize: 22, margin: '0 0 12px' }}>เกิดข้อผิดพลาดที่ไม่คาดคิด</h1>
          <p style={{ margin: '0 0 24px', color: '#5c544c' }}>ลองใหม่อีกครั้ง ถ้ายังไม่ได้ให้แจ้งผู้ดูแลพร้อมรหัสอ้างอิง</p>
          {error.digest ? <p style={{ fontFamily: 'monospace', fontSize: 12, color: '#8a8178' }}>รหัสอ้างอิง: {error.digest}</p> : null}
          <button type="button" onClick={() => retry()} style={{ padding: '10px 20px', borderRadius: 8, border: 0, background: '#c94a0a', color: '#fff', fontSize: 15, cursor: 'pointer' }}>
            ลองใหม่
          </button>
        </main>
      </body>
    </html>
  );
}
