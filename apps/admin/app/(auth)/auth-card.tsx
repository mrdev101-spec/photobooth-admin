import type { ReactNode } from 'react';
import { Building2, MonitorSmartphone, ShieldCheck, type LucideIcon } from 'lucide-react';
import { BrandMark } from '@/components/brand-mark';

/**
 * Sign-in layout from carent-flow-admin: what the system is for on a dark pane (same ink as the
 * Platform sidebar), the form card on the right. Below lg only the card is shown.
 */
export function AuthCard({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-canvas lg:grid-cols-[minmax(0,1fr)_minmax(0,32rem)]">
      <aside className="hidden flex-col justify-between bg-ink-900 px-12 py-10 lg:flex">
        <BrandMark inverse />
        <div className="max-w-md">
          <p className="text-3xl leading-snug font-bold text-white">จัดการตู้ถ่ายรูปทุกตู้จากที่เดียว</p>
          <ul className="mt-6 flex flex-col gap-4">
            <Feature icon={MonitorSmartphone} title="สถานะตู้แบบสด">ออนไลน์ เครื่องพิมพ์ กล้อง และสิ่งที่ต้องดูแล</Feature>
            <Feature icon={Building2} title="ตั้งค่าทุกตู้จากหน้าเว็บ">โหมด ราคา ธีมงาน กรอบภาพ ส่งถึงตู้อัตโนมัติ</Feature>
            <Feature icon={ShieldCheck} title="สิทธิ์ตามบทบาท ตรวจสอบย้อนหลังได้">ทุกการเปลี่ยนแปลงถูกบันทึกใน Audit log</Feature>
          </ul>
        </div>
        <p className="text-sm text-ink-400">SCLUO-DIO Photobooth</p>
      </aside>
      <main className="flex items-center justify-center px-4 py-10 lg:px-10">
        <div className="w-full max-w-md lg:max-w-none">
          <div className="mb-6 lg:hidden">
            <BrandMark />
          </div>
          <div className="rounded-card border border-ink-200 bg-surface p-6 shadow-card sm:p-8">
            <h1 className="text-2xl font-bold text-ink-900">{title}</h1>
            {description ? <p className="mt-1 mb-6 text-ink-500">{description}</p> : <div className="mb-6" />}
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

function Feature({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-ink-800 text-white">
        <Icon className="size-5" aria-hidden />
      </span>
      <span>
        <span className="block font-semibold text-white">{title}</span>
        <span className="block text-sm text-ink-300">{children}</span>
      </span>
    </li>
  );
}
