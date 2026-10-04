import clsx from 'clsx';
import { Camera } from 'lucide-react';

/**
 * Logo in the Car Rent Flow style: icon tile + two-tone wordmark + caption.
 * `inverse` = on the dark Platform Console sidebar / login pane.
 */
export function BrandMark({ inverse = false, caption = 'Admin Portal' }: { inverse?: boolean; caption?: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className={clsx('flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-600 text-white')}>
        <Camera className="size-5" aria-hidden />
      </span>
      <span className="leading-tight">
        <span className="block text-lg font-bold tracking-tight">
          <span className={inverse ? 'text-ink-200' : 'text-ink-600'}>Photo</span>
          <span className={inverse ? 'text-primary-400' : 'text-primary-600'}>booth</span>
        </span>
        <span className={clsx('block text-xs font-semibold tracking-wide uppercase', inverse ? 'text-ink-300' : 'text-ink-500')}>{caption}</span>
      </span>
    </span>
  );
}
