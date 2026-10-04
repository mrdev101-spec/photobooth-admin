'use client';

import { createContext, startTransition, useActionState, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Copy, KeyRound, LoaderCircle } from 'lucide-react';
import { initialActionState, type ActionState } from '@/lib/action-state';
import { buttonClass, FieldLabel } from './ui';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from './ui/alert-dialog';

type ServerAction = (state: ActionState, form: FormData) => Promise<ActionState>;

const FormStateContext = createContext<ActionState>(initialActionState);
const FormPendingContext = createContext(false);

/**
 * Form bound to a server action. Children are plain server-rendered inputs; field errors
 * render through <FieldError name>, the result message and one-time passwords below.
 * Submits in a transition instead of <form action>, because React resets a form after a
 * form action — a failed submit would wipe what the user typed. `confirm` asks first in a
 * dialog (shadcn AlertDialog) with the form's data kept until the answer.
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  confirm
}: {
  action: ServerAction;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  confirm?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialActionState);
  const ref = useRef<HTMLFormElement>(null);
  const [hydrated, setHydrated] = useState(false);
  // The submit waiting for the confirm dialog
  const [asking, setAsking] = useState<FormData | null>(null);
  useEffect(() => setHydrated(true), []);
  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <FormStateContext.Provider value={state}>
      <FormPendingContext.Provider value={pending}>
        <form
          ref={ref}
          className={className}
          // Never let a submit fall back to GET: fields (passwords!) would land in the URL,
          // history and server logs. Before hydration the server action makes this a real
          // POST (progressive enhancement). After hydration the action is removed and
          // onSubmit alone submits, because React's own form action resets every field.
          method={hydrated ? 'POST' : undefined}
          action={hydrated ? undefined : formAction}
          onSubmit={(e) => {
            e.preventDefault();
            if (pending) return;
            const data = new FormData(e.currentTarget);
            if (confirm) {
              setAsking(data);
              return;
            }
            startTransition(() => formAction(data));
          }}
        >
          {children}
          <FormResult state={state} />
        </form>
        {confirm ? (
          <AlertDialog open={asking !== null} onOpenChange={(open) => { if (!open) setAsking(null); }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>ยืนยันการทำรายการ</AlertDialogTitle>
                <AlertDialogDescription className="text-base text-ink-600">{confirm}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className={buttonClass('secondary')}>ยกเลิก</AlertDialogCancel>
                <AlertDialogAction
                  className={buttonClass('primary')}
                  onClick={() => {
                    const data = asking;
                    setAsking(null);
                    if (data) startTransition(() => formAction(data));
                  }}
                >
                  ยืนยัน
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </FormPendingContext.Provider>
    </FormStateContext.Provider>
  );
}

function FormResult({ state }: { state: ActionState }) {
  if (state.tempPassword) return <TempPasswordNotice password={state.tempPassword} forWhom={state.tempPasswordFor} />;
  if (!state.message) return null;
  return (
    <p role={state.ok ? 'status' : 'alert'} className={clsx('col-span-full mt-3 text-sm font-medium', state.ok ? 'text-success-700' : 'text-danger-600')}>
      {state.message}
    </p>
  );
}

export function FieldError({ name }: { name: string }) {
  const state = useContext(FormStateContext);
  const msg = state.fieldErrors?.[name];
  return msg ? <p className="text-sm text-danger-600">{msg}</p> : null;
}

export function FormField({ label, name, hint, required, children }: { label: string; name: string; hint?: ReactNode; required?: boolean; children: ReactNode }) {
  const state = useContext(FormStateContext);
  const error = state.fieldErrors?.[name];
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel htmlFor={name} label={label} required={required} />
      {children}
      {error ? <p className="text-sm text-danger-600">{error}</p> : hint ? <p className="text-sm text-ink-500">{hint}</p> : null}
    </div>
  );
}

export function SubmitButton({
  children,
  variant = 'primary',
  size = 'md',
  className,
  pendingLabel = 'กำลังบันทึก…'
}: {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  className?: string;
  pendingLabel?: string;
}) {
  const pending = useContext(FormPendingContext);
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={buttonClass(variant, size, className)}>
      {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
      {pending ? pendingLabel : children}
    </button>
  );
}

/** One-time password display. It is only in this response; reloading the page hides it. */
export function TempPasswordNotice({ password, forWhom }: { password: string; forWhom?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div role="status" className="col-span-full mt-4 rounded-lg border border-warning-600/30 bg-warning-50 p-4 text-sm text-warning-700">
      <p className="flex items-center gap-2 font-semibold">
        <KeyRound className="size-4" aria-hidden />
        รหัสผ่านชั่วคราว{forWhom ? `ของ ${forWhom}` : ''} (แสดงครั้งเดียว)
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <code className="rounded-lg border border-ink-200 bg-surface px-3 py-1.5 font-mono text-base text-ink-900 select-all">{password}</code>
        <button
          type="button"
          className={buttonClass('secondary', 'sm')}
          onClick={async () => {
            await navigator.clipboard.writeText(password);
            setCopied(true);
          }}
        >
          <Copy className="size-4" aria-hidden />
          {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
        </button>
      </div>
      <p className="mt-2">ส่งให้ผู้ใช้ทางช่องทางที่ปลอดภัย ผู้ใช้ต้องเปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบครั้งแรก</p>
    </div>
  );
}
