import type { ComponentProps, ReactNode } from 'react';
import { CircleAlert, CircleCheck, Inbox, Info, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button as UiButton, buttonVariants } from './ui/button';
import { Input as UiInput } from './ui/input';
import { NativeSelect } from './ui/native-select';
import { Label } from './ui/label';
import { Card as UiCard, CardDescription, CardTitle } from './ui/card';
import { Badge as UiBadge } from './ui/badge';
import { Table as UiTable, TableCell, TableHead } from './ui/table';
import { Alert as UiAlert, AlertDescription, AlertTitle } from './ui/alert';

/**
 * Admin UI primitives built on shadcn/ui (components/ui/*). The names and props are the
 * ones the pages already use, so pages need no change; new code may import the shadcn
 * components directly. Server-safe: no client state here.
 */

// ─── Button ─────────────────────────────────────────────────────────────────
export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

// Admin names → shadcn variants ("secondary" here has always been the bordered neutral button)
const VARIANT: Record<ButtonVariant, 'default' | 'outline' | 'ghost' | 'danger'> = {
  primary: 'default',
  secondary: 'outline',
  outline: 'outline',
  ghost: 'ghost',
  danger: 'danger'
};
const SIZE: Record<ButtonSize, 'default' | 'sm' | 'lg' | 'icon'> = { sm: 'sm', md: 'default', lg: 'lg', icon: 'icon' };

/** Button classes for links and other elements styled as buttons. */
export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className?: string) {
  return buttonVariants({ variant: VARIANT[variant], size: SIZE[size], className });
}

export function Button({ variant = 'primary', size = 'md', icon, className, children, ...props }: ComponentProps<'button'> & { variant?: ButtonVariant; size?: ButtonSize; icon?: ReactNode }) {
  return (
    <UiButton variant={VARIANT[variant]} size={SIZE[size]} className={className} {...props}>
      {icon}
      {children}
    </UiButton>
  );
}

// ─── Form controls ──────────────────────────────────────────────────────────
const CONTROL =
  'w-full rounded-lg border bg-surface px-3 text-base text-ink-900 placeholder:text-ink-500 transition-[color,box-shadow] ' +
  'outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:bg-ink-50 disabled:text-ink-500';

/** Classes for controls that are not <Input> / <Select> (textarea, custom inputs). */
export function controlClass(invalid?: boolean, extra?: string) {
  return cn(CONTROL, invalid ? 'border-danger-600' : 'border-ink-300', extra);
}

export function Input({ className, invalid, leading, ...props }: ComponentProps<'input'> & { invalid?: boolean; leading?: ReactNode }) {
  const input = (
    <UiInput
      aria-invalid={invalid || undefined}
      className={cn('h-11 rounded-lg border-ink-300 bg-surface text-base text-ink-900 shadow-none placeholder:text-ink-500 md:text-base disabled:bg-ink-50', leading && 'pl-10', className)}
      {...props}
    />
  );
  if (!leading) return input;
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-400">{leading}</span>
      {input}
    </div>
  );
}

export function Select({ className, wrapperClassName, ...props }: ComponentProps<'select'> & { wrapperClassName?: string }) {
  return (
    <NativeSelect
      wrapperClassName={wrapperClassName ?? 'w-full'}
      className={cn('h-11 rounded-lg border-ink-300 bg-surface text-base text-ink-900 shadow-none', className)}
      {...(props as Omit<ComponentProps<'select'>, 'size'>)}
    />
  );
}

function FieldLabel({ htmlFor, label, required }: { htmlFor?: string; label: string; required?: boolean }) {
  return (
    <Label htmlFor={htmlFor} className="gap-0 text-sm font-medium text-ink-700">
      {label}
      {required ? <span className="ml-0.5 text-primary-600">*</span> : null}
    </Label>
  );
}

export function Field({ label, htmlFor, error, hint, required, children }: { label: string; htmlFor?: string; error?: string; hint?: ReactNode; required?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel htmlFor={htmlFor} label={label} required={required} />
      {children}
      {error ? <p className="text-sm text-danger-600">{error}</p> : hint ? <p className="text-sm text-ink-500">{hint}</p> : null}
    </div>
  );
}
export { FieldLabel };

// ─── Cards ──────────────────────────────────────────────────────────────────
export function CardHeader({ title, subtitle, icon, actions, className }: { title: ReactNode; subtitle?: ReactNode; icon?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div data-slot="card-header" className={cn('flex items-start gap-3 border-b border-ink-100 px-4 py-3 sm:px-5', className)}>
      {icon ? <span className="mt-0.5 text-primary-600 [&>svg]:size-5">{icon}</span> : null}
      <div className="min-w-0 flex-1">
        <CardTitle className="text-lg leading-tight font-semibold text-ink-900">
          <h2>{title}</h2>
        </CardTitle>
        {subtitle ? <CardDescription className="mt-0.5 text-sm text-ink-500">{subtitle}</CardDescription> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/**
 * Card with an optional header (icon + title + subtitle + actions). `flush` drops the body
 * padding for tables and lists that run edge to edge.
 */
export function Card({
  className,
  bodyClassName,
  children,
  title,
  subtitle,
  icon,
  actions,
  flush
}: {
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  flush?: boolean;
}) {
  return (
    <UiCard className={cn('gap-0 overflow-hidden rounded-card border-ink-200 bg-surface py-0 shadow-card', className)}>
      {title || actions ? <CardHeader title={title} subtitle={subtitle} icon={icon} actions={actions} /> : null}
      <div data-slot="card-content" className={cn(!flush && 'px-4 py-4 sm:px-5', bodyClassName)}>{children}</div>
    </UiCard>
  );
}

export function StatCard({ label, value, icon, hint, tone = 'default', href }: { label: ReactNode; value: ReactNode; icon?: ReactNode; hint?: ReactNode; tone?: 'default' | 'primary' | 'danger'; href?: string }) {
  const body = (
    <>
      {icon ? (
        <span
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-lg [&>svg]:size-5',
            tone === 'primary' ? 'bg-primary-600 text-white' : tone === 'danger' ? 'bg-danger-50 text-danger-600' : 'bg-ink-100 text-ink-700'
          )}
        >
          {icon}
        </span>
      ) : null}
      <span className="min-w-0">
        <span className="block text-sm text-ink-500">{label}</span>
        <span className={cn('block text-2xl leading-tight font-semibold', tone === 'danger' ? 'text-danger-600' : 'text-ink-900')}>{value}</span>
        {hint ? <span className="mt-0.5 block text-sm text-ink-500">{hint}</span> : null}
      </span>
    </>
  );
  const cls = cn(
    'flex w-full flex-row items-start gap-3 rounded-card bg-surface p-4 text-left shadow-card',
    tone === 'primary' ? 'border-primary-200 bg-primary-50/40' : 'border-ink-200',
    href && 'transition-colors hover:border-primary-300'
  );
  return href ? (
    <a href={href} data-slot="card" className={cn('border', cls)}>
      {body}
    </a>
  ) : (
    <UiCard className={cls}>{body}</UiCard>
  );
}

// ─── Badges ─────────────────────────────────────────────────────────────────
/** New tones + the first-generation names (ok / warn / muted / platform) mapped onto them. */
export type Tone = 'neutral' | 'info' | 'warning' | 'violet' | 'success' | 'primary' | 'danger' | 'ok' | 'warn' | 'muted' | 'platform';
type BaseTone = 'neutral' | 'info' | 'warning' | 'violet' | 'success' | 'primary' | 'danger';
const TONE_ALIAS: Record<Tone, BaseTone> = { neutral: 'neutral', info: 'info', warning: 'warning', violet: 'violet', success: 'success', primary: 'primary', danger: 'danger', ok: 'success', warn: 'warning', muted: 'neutral', platform: 'violet' };

const TONES: Record<BaseTone, string> = {
  neutral: 'bg-ink-100 text-ink-700 ring-ink-200',
  info: 'bg-info-50 text-info-700 ring-info-600/20',
  warning: 'bg-warning-50 text-warning-700 ring-warning-600/25',
  violet: 'bg-violet-50 text-violet-600 ring-violet-600/20',
  success: 'bg-success-50 text-success-700 ring-success-600/20',
  primary: 'bg-primary-50 text-primary-700 ring-primary-600/20',
  danger: 'bg-danger-50 text-danger-700 ring-danger-600/25'
};
const DOTS: Record<BaseTone, string> = {
  neutral: 'bg-ink-400',
  info: 'bg-info-600',
  warning: 'bg-warning-600',
  violet: 'bg-violet-600',
  success: 'bg-success-600',
  primary: 'bg-primary-500',
  danger: 'bg-danger-600'
};

export function Badge({ tone = 'neutral', dot, icon, children, className }: { tone?: Tone; dot?: boolean; icon?: ReactNode; children: ReactNode; className?: string }) {
  const t = TONE_ALIAS[tone];
  return (
    <UiBadge className={cn('gap-1.5 rounded-full border-0 px-2.5 py-0.5 text-sm font-medium ring-1 ring-inset', TONES[t], className)}>
      {dot ? <span className={cn('size-1.5 rounded-full', DOTS[t])} aria-hidden /> : null}
      {icon}
      {children}
    </UiBadge>
  );
}

// ─── Page structure ─────────────────────────────────────────────────────────
export function PageHeader({ title, description, actions, breadcrumb }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; breadcrumb?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {breadcrumb ? <div className="mb-1 text-sm text-ink-500">{breadcrumb}</div> : null}
        <h1 className="text-[1.75rem] leading-tight font-bold text-ink-900">{title}</h1>
        {description ? <div className="mt-1 text-ink-500">{description}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Table frame. Inside a flush Card, pass `bare` so the card provides the border. */
export function Table({ children, bare }: { children: ReactNode; bare?: boolean }) {
  return (
    <div className={cn(!bare && 'overflow-hidden rounded-card border border-ink-200 bg-surface shadow-card')}>
      <UiTable className="border-collapse text-left text-base">{children}</UiTable>
    </div>
  );
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <TableHead scope="col" className={cn('h-auto border-b border-ink-200 bg-ink-50 px-4 py-3 text-sm font-semibold text-ink-600', className)}>
      {children}
    </TableHead>
  );
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <TableCell className={cn('border-b border-ink-100 px-4 py-3 align-middle whitespace-normal', className)}>{children}</TableCell>;
}

export function EmptyState({ title, children, icon, action }: { title: string; children?: ReactNode; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-card border border-dashed border-ink-300 bg-surface px-6 py-12 text-center">
      <span className="mb-3 flex size-12 items-center justify-center rounded-full bg-primary-50 text-primary-600 [&>svg]:size-6">{icon ?? <Inbox aria-hidden />}</span>
      <h3 className="text-lg font-semibold text-ink-900">{title}</h3>
      {children ? <div className="mt-1 max-w-md text-ink-500">{children}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

const ALERT: Record<'info' | 'ok' | 'warn' | 'danger', { box: string; Icon: typeof Info }> = {
  info: { box: 'border-info-600/30 bg-info-50 text-info-700', Icon: Info },
  ok: { box: 'border-success-600/30 bg-success-50 text-success-700', Icon: CircleCheck },
  warn: { box: 'border-warning-600/30 bg-warning-50 text-warning-700', Icon: TriangleAlert },
  danger: { box: 'border-danger-600/30 bg-danger-50 text-danger-700', Icon: CircleAlert }
};

/** Alert box with an icon (was "Notice"; both names work). */
export function Notice({ tone = 'info', title, children, className }: { tone?: 'info' | 'warn' | 'danger' | 'ok'; title?: ReactNode; children?: ReactNode; className?: string }) {
  const s = ALERT[tone];
  return (
    <UiAlert role={tone === 'danger' ? 'alert' : 'status'} className={cn('has-[>svg]:gap-x-3 [&>svg]:size-5 [&>svg]:translate-y-0', s.box, className)}>
      <s.Icon aria-hidden />
      {title ? <AlertTitle className="line-clamp-none font-semibold">{title}</AlertTitle> : null}
      {children ? <AlertDescription className="text-sm text-current">{children}</AlertDescription> : null}
    </UiAlert>
  );
}
export const Alert = Notice;

/** Label / value rows used on detail cards. */
export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-3 py-2 text-base">
      <dt className="text-ink-500">{label}</dt>
      <dd className="min-w-0 break-words text-ink-900">{children}</dd>
    </div>
  );
}
