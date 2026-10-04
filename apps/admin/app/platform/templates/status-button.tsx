import { ActionForm, SubmitButton } from '@/components/form';
import type { TemplateKind } from '@/lib/template-visibility';
import { setTemplateStatusAction } from './actions';

/** Retire / re-publish one template for every kiosk. */
export function TemplateStatusButton({ kind, id, name, status, kiosks, size = 'sm' }: { kind: TemplateKind; id: string; name: string; status: 'published' | 'retired'; kiosks: number; size?: 'sm' | 'md' }) {
  const retire = status === 'published';
  return (
    <ActionForm action={setTemplateStatusAction} className="inline-flex flex-col items-end gap-1" confirm={retire ? `เลิกใช้ "${name}" ในทุกตู้? (${kiosks} ตู้กำลังแสดงอยู่)` : undefined}>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={retire ? 'retired' : 'published'} />
      <SubmitButton size={size} variant={retire ? 'outline' : 'primary'} pendingLabel="กำลังส่งไปตู้…">
        {retire ? 'เลิกใช้' : 'เปิดใช้อีกครั้ง'}
      </SubmitButton>
    </ActionForm>
  );
}
