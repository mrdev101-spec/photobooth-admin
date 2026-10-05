import 'server-only';
import type { KioskPaymentStatus } from '@photobooth/contracts';
import { cancelKioskPayment, createKioskPayment, fillMissingFees, isPaymentError, kioskPaymentState, kioskPaymentStatus, sweepExpiredPayments, type NewPayment } from '@/server/services/payments';
import { assertKioskServing, type KioskAuth } from './auth';
import { KioskApiError } from './http';

/** Kiosk side of payments: status before the QR, create, poll, cancel. Errors keep the PM codes. */

async function mapped<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isPaymentError(err)) throw new KioskApiError(err.code, err.status, err.message);
    throw err;
  }
}

export async function handlePaymentStatus(auth: KioskAuth): Promise<KioskPaymentStatus> {
  return kioskPaymentStatus(auth);
}

export async function handlePaymentCreate(auth: KioskAuth, input: NewPayment) {
  assertKioskServing(auth);
  await sweepExpiredPayments().catch(() => {});
  await fillMissingFees(5).catch(() => {});
  return mapped(() => createKioskPayment(auth, input));
}

export const handlePaymentState = (auth: KioskAuth, id: string) => mapped(() => kioskPaymentState(auth, id));
export const handlePaymentCancel = (auth: KioskAuth, id: string) => mapped(() => cancelKioskPayment(auth, id));
