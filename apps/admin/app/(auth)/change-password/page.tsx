import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/server/auth/context';
import { PASSWORD_MIN } from '@/server/auth/password';
import { ActionForm, FormField, SubmitButton } from '@/components/form';
import { Input } from '@/components/ui';
import { AuthCard } from '../auth-card';
import { changePasswordAction } from './actions';

export const metadata: Metadata = { title: 'เปลี่ยนรหัสผ่าน' };

export default async function ChangePasswordPage() {
  const user = await requireUser({ allowPasswordChange: true });
  return (
    <AuthCard
      title="เปลี่ยนรหัสผ่าน"
      description={user.mustChangePassword ? 'บัญชีนี้ใช้รหัสผ่านชั่วคราว ตั้งรหัสผ่านใหม่ก่อนใช้งาน' : `บัญชี ${user.email}`}
    >
      <ActionForm action={changePasswordAction} className="flex flex-col gap-4">
        <input type="text" name="username" autoComplete="username" defaultValue={user.email} hidden readOnly />
        <FormField label="รหัสผ่านปัจจุบัน" name="current">
          <Input id="current" name="current" type="password" autoComplete="current-password" required autoFocus />
        </FormField>
        <FormField label="รหัสผ่านใหม่" name="next" hint={`อย่างน้อย ${PASSWORD_MIN} ตัวอักษร`}>
          <Input id="next" name="next" type="password" autoComplete="new-password" minLength={PASSWORD_MIN} required />
        </FormField>
        <FormField label="ยืนยันรหัสผ่านใหม่" name="confirm">
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
        </FormField>
        <SubmitButton className="mt-2 w-full">บันทึกรหัสผ่านใหม่</SubmitButton>
      </ActionForm>
      {!user.mustChangePassword ? (
        <p className="mt-4 text-center text-sm">
          <Link href="/" className="text-ink-600 underline hover:text-ink-900">
            กลับ
          </Link>
        </p>
      ) : null}
    </AuthCard>
  );
}
