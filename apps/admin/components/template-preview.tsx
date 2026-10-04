import clsx from 'clsx';
import { BadgeCheck, Frame, ReceiptText, Sparkles } from 'lucide-react';
import type { TemplateKind } from '@/lib/template-visibility';

const ICON: Record<TemplateKind, typeof Frame> = { 'photo-4x6': Frame, badge: BadgeCheck, classic: ReceiptText, 'ai-scene': Sparkles };

/**
 * A template's preview in a 2:3 box. 4x6 prints and AI posters fill it; round badges and tall
 * receipts are shown whole on a light background.
 */
export function TemplatePreview({ kind, src, className, label = 'ตู้สร้างภาพตัวอย่างเอง' }: { kind: TemplateKind; src?: string; className?: string; label?: string }) {
  const Icon = ICON[kind];
  const contain = kind === 'badge' || kind === 'classic';
  return (
    <span className={clsx('relative flex aspect-[2/3] items-center justify-center overflow-hidden bg-ink-50', contain && 'p-3', className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" className={clsx('size-full', contain ? 'object-contain drop-shadow-sm' : 'object-cover')} />
      ) : (
        <span className="flex flex-col items-center gap-2 px-3 text-center text-ink-400">
          <Icon className="size-10" aria-hidden />
          <span className="text-xs">{label}</span>
        </span>
      )}
    </span>
  );
}
