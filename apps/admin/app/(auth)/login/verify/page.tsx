import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { KeyRound } from 'lucide-react';
import { getSessionUser } from '@/server/auth/session';
import { pendingChallengeEmail } from '@/server/auth/two-factor';
import { ActionForm, FormField, SubmitButton } from '@/components/form';
import { Input } from '@/components/ui';
import { AuthCard } from '../../auth-card';
import { resendCodeAction, verifyCodeAction } from './actions';

export const metadata: Metadata = { title: 'ยืนยันการเข้าสู่ระบบ' };

export default async function VerifyLoginPage() {
  if (await getSessionUser()) redirect('/');
  const email = await pendingChallengeEmail();
  if (!email) redirect('/login');
  return (
    <AuthCard title="ยืนยันการเข้าสู่ระบบ" description={`เราส่งรหัส 6 หลักไปที่ ${email} (ใช้ได้ 10 นาที)`}>
      <ActionForm action={verifyCodeAction} className="flex flex-col gap-4">
        <FormField label="รหัสจากอีเมล" name="code" required>
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            autoFocus
            className="text-center text-2xl tracking-[0.5em]"
            leading={<KeyRound className="size-4" aria-hidden />}
          />
        </FormField>
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" name="remember" className="size-4 accent-primary-600" />
          จดจำอุปกรณ์นี้ 30 วัน (ไม่ต้องกรอกรหัสอีก)
        </label>
        <SubmitButton className="mt-2 h-12 w-full text-lg" pendingLabel="กำลังตรวจรหัส…">
          ยืนยัน
        </SubmitButton>
      </ActionForm>
      <div className="mt-5 flex items-center justify-between gap-3 text-sm">
        <ActionForm action={resendCodeAction}>
          <SubmitButton variant="outline" size="sm" pendingLabel="กำลังส่ง…">
            ส่งรหัสใหม่
          </SubmitButton>
        </ActionForm>
        <Link href="/login" className="text-ink-500 underline-offset-4 hover:underline">
          กลับไปหน้าเข้าสู่ระบบ
        </Link>
      </div>
    </AuthCard>
  );
}
