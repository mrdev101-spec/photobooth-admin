import { describe, expect, it } from 'vitest';
import { defaultKioskSettings } from '@photobooth/contracts';
import { diffSettings } from './settings-diff';

describe('diffSettings', () => {
  it('finds nothing between identical documents', () => {
    expect(diffSettings(defaultKioskSettings(), defaultKioskSettings())).toEqual([]);
  });

  it('reports changed leaves with labels', () => {
    const a = defaultKioskSettings();
    const b = defaultKioskSettings();
    b.products.photo.price = 120;
    b.payment.enabled = true;
    b.templates.photoLayouts = ['pastel', 'neon'];
    const changes = diffSettings(a, b);
    expect(changes).toContainEqual({ path: 'products.photo.price', label: 'ราคาภาพ 4x6', before: '99', after: '120' });
    expect(changes).toContainEqual({ path: 'payment.enabled', label: 'รับเงิน', before: 'ปิด', after: 'เปิด' });
    expect(changes).toContainEqual({ path: 'templates.photoLayouts', label: 'กรอบภาพ 4x6 ที่เปิด', before: 'ทั้งหมด', after: 'pastel, neon' });
  });

  it('never shows the PIN hash', () => {
    const a = defaultKioskSettings();
    const b = { ...defaultKioskSettings(), adminPin: { algo: 'pbkdf2-sha256' as const, iterations: 210000, salt: 'c2FsdHNhbHRzYWx0c2FsdA==', hash: 'SECRET-HASH-VALUE-0000000000000000' } };
    const changes = diffSettings(a, b);
    expect(changes).toEqual([{ path: 'adminPin', label: 'รหัสผู้ดูแลตู้', before: 'ไม่มี', after: 'ตั้งไว้' }]);
    expect(JSON.stringify(changes)).not.toContain('SECRET');
  });
});
