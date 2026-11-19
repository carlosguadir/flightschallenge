import { createHash } from 'node:crypto';

import type { BookingRequest } from '@flight/shared';

/**
 * Canonical request hash: fixed field order and normalized passenger values.
 * Never hash the raw body, headers or timestamps.
 */
export function hashBookingRequest(request: BookingRequest): string {
  const canonical = JSON.stringify({
    flightId: request.flightId,
    seatIds: [...request.seatIds].sort(),
    passenger: {
      name: request.passenger.name.trim(),
      email: request.passenger.email.trim().toLowerCase(),
    },
    payment: {
      method: request.payment.method,
    },
  });

  return createHash('sha256').update(canonical).digest('hex');
}
