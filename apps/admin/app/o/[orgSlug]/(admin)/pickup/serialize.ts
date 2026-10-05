import { formatPickupCode } from '@photobooth/contracts';
import { productLabel } from '@/lib/order-labels';
import type { OrderRow } from '@/server/services/orders';
import { effectiveStatus } from '@/server/services/orders';

/** What the pickup counter (client) needs about an order — JSON-safe, no internal fields. */
export interface CounterOrder {
  id: string;
  code: string;
  codeLabel: string;
  status: string;
  kioskName: string;
  branchName: string | null;
  product: string;
  productLabel: string;
  items: { type: string; qty: number }[];
  badge: { size: string; copies: number; frame: string } | null;
  amount: number;
  orderedAt: string;
  claimedAt: string | null;
  claimedStation: string | null;
  handedOverAt: string | null;
  reprintAllowance: number;
  photo: string | null;
  badgeImage: string | null;
}

/** Images are the order's small thumbnail where there is one; the print page uses the originals. */
export function toCounterOrder(o: OrderRow, orgSlug: string): CounterOrder {
  const file = (kind: string) => o.files.find((f) => f.kind === kind)?.url ?? null;
  // The kiosk's thumbnail is of the photo, or of the badge when the order has no photo
  const thumb = o.hasThumb ? `/o/${orgSlug}/orders/${o.id}/thumb` : null;
  const photo = file('photo') ?? file('ai');
  return {
    id: o.id,
    code: o.code ?? '',
    codeLabel: formatPickupCode(o.code ?? ''),
    status: effectiveStatus(o),
    kioskName: o.kioskName,
    branchName: o.branchName,
    product: o.product,
    productLabel: productLabel(o.product, o.mode),
    items: o.items,
    badge: o.badge ? { size: o.badge.size, copies: o.badge.copies, frame: o.badge.frame } : null,
    amount: o.amountSatang / 100,
    orderedAt: o.orderedAt.toISOString(),
    claimedAt: o.claimedAt?.toISOString() ?? null,
    claimedStation: o.claimedStation,
    handedOverAt: o.handedOverAt?.toISOString() ?? null,
    reprintAllowance: o.reprintAllowance,
    photo: photo ? (thumb ?? photo) : null,
    badgeImage: file('badge') ? (!photo && thumb ? thumb : file('badge')) : null
  };
}
