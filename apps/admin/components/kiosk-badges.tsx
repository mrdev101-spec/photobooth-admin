import { APP_MODES } from '@photobooth/catalog';
import { CONNECTION_LABEL, type Connection } from '@/lib/kiosk-status';
import { Badge } from './ui';

export function ConnectionBadge({ connection }: { connection: Connection }) {
  const c = CONNECTION_LABEL[connection];
  return (
    <Badge tone={c.tone} dot>
      {c.label}
    </Badge>
  );
}

export function modeName(mode: string | null | undefined): string {
  return APP_MODES.find((m) => m.id === mode)?.name ?? '—';
}
