import { notFound } from 'next/navigation';
import { formatPickupCode } from '@photobooth/contracts';
import { getOrgContext } from '@/server/auth/context';
import { can } from '@/server/auth/rbac';
import { getOrder } from '@/server/services/orders';
import { AppError } from '@/server/lib/errors';
import { AutoPrint } from './auto-print';

export const metadata = { title: 'พิมพ์ออเดอร์' };

/**
 * Browser printing for the pickup counter until the Print Agent (D9) exists: one 4x6 page per
 * image. Set the printer to 4x6 borderless. Only an order the counter has just claimed prints.
 * The badge prints as its art; the cut-line sheet comes with the kiosk's renderer (§15 risk 7).
 */
export default async function PrintOrderPage({ params }: { params: Promise<{ orgSlug: string; orderId: string }> }) {
  const { orgSlug, orderId } = await params;
  const ctx = await getOrgContext(orgSlug);
  if (!can(ctx.principal, 'pickup.use')) notFound();
  const order = await getOrder(ctx, orderId).catch((err) => {
    if (err instanceof AppError && err.code === 'not_found') notFound();
    throw err;
  });
  if (order.status !== 'claimed') {
    return <p style={{ padding: 24, fontFamily: 'sans-serif' }}>ออเดอร์นี้ยังไม่ได้กด “พิมพ์” ที่จุดรับรูป หรือส่งมอบไปแล้ว</p>;
  }
  const photo = order.files.find((f) => f.kind === 'photo' || f.kind === 'ai');
  const badge = order.files.find((f) => f.kind === 'badge');
  const copies = order.badge?.copies ?? 1;
  return (
    <>
      <style>{`
        @page { size: 4in 6in; margin: 0; }
        html, body { margin: 0; background: #fff; }
        .page { width: 4in; height: 6in; display: flex; align-items: center; justify-content: center; page-break-after: always; break-after: page; overflow: hidden; }
        .page:last-child { page-break-after: auto; break-after: auto; }
        .photo { width: 100%; height: 100%; object-fit: cover; }
        .badges { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.15in; padding: 0.2in; }
        .badge { width: 1.7in; height: 1.7in; border-radius: 50%; object-fit: cover; outline: 1px dashed #999; outline-offset: 0.06in; }
        .label { position: fixed; bottom: 0.08in; width: 100%; text-align: center; font: 9px sans-serif; color: #666; }
        @media screen { body { background: #ddd; } .page { background: #fff; margin: 12px auto; box-shadow: 0 1px 4px rgba(0,0,0,.2); } }
      `}</style>
      {photo ? (
        <div className="page">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="photo" src={photo.url} alt="" />
        </div>
      ) : null}
      {badge ? (
        <div className="page">
          <div className="badges">
            {Array.from({ length: Math.min(copies, 6) }, (_, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} className="badge" src={badge.url} alt="" />
            ))}
          </div>
          <span className="label">
            {formatPickupCode(order.code ?? '')} · เข็มกลัด {order.badge?.size} มม.
          </span>
        </div>
      ) : null}
      <AutoPrint />
    </>
  );
}
