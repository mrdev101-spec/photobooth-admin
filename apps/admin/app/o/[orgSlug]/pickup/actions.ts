'use server';

import { getOrgContext } from '@/server/auth/context';
import { claimOrder, findOrderByPickupInput, getOrder, handOverOrder } from '@/server/services/orders';
import { AppError } from '@/server/lib/errors';
import { toCounterOrder, type CounterOrder } from './serialize';

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function wrap<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    console.error(err);
    return { ok: false, error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' };
  }
}

/** Scanned slip / typed code → order. */
export async function lookupAction(orgSlug: string, input: string): Promise<Result<CounterOrder>> {
  return wrap(async () => {
    const ctx = await getOrgContext(orgSlug);
    const order = await findOrderByPickupInput(ctx, input);
    if (!order) throw new AppError('ไม่พบออเดอร์นี้ในบัญชีของคุณ (หรือภาพหมดอายุแล้ว)');
    if (order.fulfillment !== 'pickup') throw new AppError('ออเดอร์นี้พิมพ์ที่ตู้แล้ว ไม่ต้องรับที่จุดรับรูป');
    return toCounterOrder(order);
  });
}

export async function claimAction(orgSlug: string, orderId: string, station: string): Promise<Result<CounterOrder>> {
  return wrap(async () => {
    const ctx = await getOrgContext(orgSlug);
    await claimOrder(ctx, orderId, station);
    return toCounterOrder(await getOrder(ctx, orderId));
  });
}

export async function handOverAction(orgSlug: string, orderId: string): Promise<Result<CounterOrder>> {
  return wrap(async () => {
    const ctx = await getOrgContext(orgSlug);
    await handOverOrder(ctx, orderId);
    return toCounterOrder(await getOrder(ctx, orderId));
  });
}
