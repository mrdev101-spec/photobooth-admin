import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/server/auth/session';
import { ActionForm, FormField, SubmitButton } from '@/components/form';
import { Info, Lock, Mail } from 'lucide-react';
import { Input } from '@/components/ui';
import { AuthCard } from '../auth-card';
import { loginAction } from './actions';

export const metadata: Metadata = { title: 'เข้าสู่ระบบ' };

export default async function LoginPage() {
  if (await getSessionUser()) redirect('/');
  return (
    <AuthCard title="เข้าสู่ระบบ" description="สำหรับทีมแพลตฟอร์มและลูกค้าที่มีบัญชี">
      <ActionForm action={loginAction} className="flex flex-col gap-4">
        <FormField label="อีเมล" name="email" required>
          <Input id="email" name="email" type="email" autoComplete="username" required autoFocus leading={<Mail className="size-4" aria-hidden />} />
        </FormField>
        <FormField label="รหัสผ่าน" name="password" required>
          <Input id="password" name="password" type="password" autoComplete="current-password" required leading={<Lock className="size-4" aria-hidden />} />
        </FormField>
        <SubmitButton className="mt-2 h-12 w-full text-lg" pendingLabel="กำลังเข้าสู่ระบบ…">
          เข้าสู่ระบบ
        </SubmitButton>
      </ActionForm>
      <p className="mt-5 flex gap-2 text-sm text-ink-500">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        ลืมรหัสผ่าน? ติดต่อเจ้าของบัญชีร้านของคุณ หรือผู้ดูแลแพลตฟอร์ม
      </p>
    </AuthCard>
  );
}
