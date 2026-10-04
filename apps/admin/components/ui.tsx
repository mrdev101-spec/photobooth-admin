import clsx from 'clsx';
import type { ComponentProps, ReactNode } from 'react';
import { ChevronDown, CircleAlert, CircleCheck, Inbox, Info, TriangleAlert } from 'lucide-react';

/**
 * Server-safe UI primitives, ported from the Car Rent Flow design system
 * (carent-flow-admin/src/components/ui) so both products look and behave the same.
 */

// ─── Button ─────────────────────────────────────────────────────────────────
export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800 disabled:bg-primary-300',
  secondary: 'border border-ink-300 bg-surface text-ink-800 hover:bg-ink-50 active:bg-ink-100 disabled:text-ink-400',
  outline: 'border border-ink-300 bg-surface text-ink-800 hover:bg-ink-50 active:bg-ink-100 disabled:text-ink-400',
  ghost: 'text-ink-700 hover:bg-ink-100 active:bg-ink-200 disabled:text-ink-400',
  danger: 'border border-danger-600 bg-surface text-danger-600 hover:bg-danger-50 disabled:opacity-50'
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-11 px-4 text-base gap-2',
  lg: 'h-12 px-6 text-lg gap-2',
  icon: 'size-10 justify-center'
};

export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className?: string) {
  return clsx(
    'inline-flex shrink-0 items-center justify-center rounded-lg font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed',
    VARIANTS[variant],
    SIZES[size],
    className
  );
}

export function Button({ variant = 'primary', size = 'md', icon, className, children, ...props }: ComponentProps<'button'> & { variant?: ButtonVariant; size?: ButtonSize; icon?: ReactNode }) {
  return (
    <button className={buttonClass(variant, size, className)} {...props}>
      {icon}
      {children}
    </button>
  );
}

// ─── Form controls ──────────────────────────────────────────────────────────
const CONTROL =
  'w-full rounded-lg border bg-surface px-3 text-base text-ink-900 placeholder:text-ink-500 transition-colors ' +
  'focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:bg-ink-50 disabled:text-ink-500';

export function controlClass(invalid?: boolean, extra?: string) {
  return clsx(CONTROL, invalid ? 'border-danger-600' : 'border-ink-300', extra);
}

export function Input({ className, invalid, leading, ...props }: ComponentProps<'input'> & { invalid?: boolean; leading?: ReactNode }) {
  const input = <input aria-invalid={invalid || undefined} className={controlClass(invalid, clsx('h-11', leading && 'pl-10', className))} {...props} />;
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
    <div className={clsx('relative', wrapperClassName ?? 'w-full')}>
      <select className={controlClass(false, clsx('h-11 appearance-none pr-9', className))} {...props} />
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-500" aria-hidden />
    </div>
  );
}

export function Field({ label, htmlFor, error, hint, required, children }: { label: string; htmlFor?: string; error?: string; hint?: ReactNode; required?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink-700">
        {label}
        {required ? <span className="ml-0.5 text-primary-600">*</span> : null}
      </label>
      {children}
      {error ? <p className="text-sm text-danger-600">{error}</p> : hint ? <p className="text-sm text-ink-500">{hint}</p> : null}
    </div>
  );
}

// ─── Cards ──────────────────────────────────────────────────────────────────
export function CardHeader({ title, subtitle, icon, actions, className }: { title: ReactNode; subtitle?: ReactNode; icon?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={clsx('flex items-start gap-3 border-b border-ink-100 px-4 py-3 sm:px-5', className)}>
      {icon ? <span className="mt-0.5 text-primary-600 [&>svg]:size-5">{icon}</span> : null}
      <div className="min-w-0 flex-1">
        <h2 className="text-lg leading-tight font-semibold text-ink-900">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p> : null}
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
    <section className={clsx('overflow-hidden rounded-card border border-ink-200 bg-surface shadow-card', className)}>
      {title || actions ? <CardHeader title={title} subtitle={subtitle} icon={icon} actions={actions} /> : null}
      <div className={clsx(!flush && 'px-4 py-4 sm:px-5', bodyClassName)}>{children}</div>
    </section>
  );
}

export function StatCard({ label, value, icon, hint, tone = 'default', href }: { label: ReactNode; value: ReactNode; icon?: ReactNode; hint?: ReactNode; tone?: 'default' | 'primary' | 'danger'; href?: string }) {
  const body = (
    <>
      {icon ? (
        <span
          className={clsx(
            'flex size-10 shrink-0 items-center justify-center rounded-lg [&>svg]:size-5',
            tone === 'primary' ? 'bg-primary-600 text-white' : tone === 'danger' ? 'bg-danger-50 text-danger-600' : 'bg-ink-100 text-ink-700'
          )}
        >
          {icon}
        </span>
      ) : null}
      <span className="min-w-0">
        <span className="block text-sm text-ink-500">{label}</span>
        <span className={clsx('block text-2xl leading-tight font-semibold', tone === 'danger' ? 'text-danger-600' : 'text-ink-900')}>{value}</span>
        {hint ? <span className="mt-0.5 block text-sm text-ink-500">{hint}</span> : null}
      </span>
    </>
  );
  const cls = clsx(
    'flex w-full items-start gap-3 rounded-card border bg-surface p-4 text-left shadow-card',
    tone === 'primary' ? 'border-primary-200' : 'border-ink-200',
    href && 'transition-colors hover:border-primary-300'
  );
  return href ? (
    <a href={href} className={cls}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
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
  primary: 'bg-primary-600',
  danger: 'bg-danger-600'
};

export function Badge({ tone = 'neutral', dot, icon, children, className }: { tone?: Tone; dot?: boolean; icon?: ReactNode; children: ReactNode; className?: string }) {
  const t = TONE_ALIAS[tone];
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-medium whitespace-nowrap ring-1 ring-inset', TONES[t], className)}>
      {dot ? <span className={clsx('size-1.5 rounded-full', DOTS[t])} aria-hidden /> : null}
      {icon}
      {children}
    </span>
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
    <div className={clsx('overflow-x-auto', !bare && 'rounded-card border border-ink-200 bg-surface shadow-card')}>
      <table className="w-full border-collapse text-left text-base">{children}</table>
    </div>
  );
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th scope="col" className={clsx('border-b border-ink-200 bg-ink-50 px-4 py-3 text-sm font-semibold whitespace-nowrap text-ink-600', className)}>{children}</th>;
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={clsx('border-b border-ink-100 px-4 py-3 align-middle', className)}>{children}</td>;
}

export function EmptyState({ title, children, icon, action }: { title: string; children?: ReactNode; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-card border border-dashed border-ink-300 bg-surface px-6 py-12 text-center">
      <span className="mb-3 flex size-12 items-center justify-center rounded-full bg-ink-100 text-ink-500 [&>svg]:size-6">{icon ?? <Inbox aria-hidden />}</span>
      <h3 className="text-lg font-semibold text-ink-900">{title}</h3>
      {children ? <div className="mt-1 max-w-md text-ink-500">{children}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

const ALERT: Record<'info' | 'ok' | 'warn' | 'danger', { box: string; icon: ReactNode }> = {
  info: { box: 'border-info-600/30 bg-info-50 text-info-700', icon: <Info className="size-5" aria-hidden /> },
  ok: { box: 'border-success-600/30 bg-success-50 text-success-700', icon: <CircleCheck className="size-5" aria-hidden /> },
  warn: { box: 'border-warning-600/30 bg-warning-50 text-warning-700', icon: <TriangleAlert className="size-5" aria-hidden /> },
  danger: { box: 'border-danger-600/30 bg-danger-50 text-danger-700', icon: <CircleAlert className="size-5" aria-hidden /> }
};

/** Alert box with an icon (was "Notice"; both names work). */
export function Notice({ tone = 'info', title, children, className }: { tone?: 'info' | 'warn' | 'danger' | 'ok'; title?: ReactNode; children?: ReactNode; className?: string }) {
  const s = ALERT[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={clsx('flex gap-3 rounded-lg border px-4 py-3', s.box, className)}>
      <span className="mt-0.5 shrink-0">{s.icon}</span>
      <div className="min-w-0 text-sm">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={title ? 'mt-0.5' : undefined}>{children}</div> : null}
      </div>
    </div>
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
