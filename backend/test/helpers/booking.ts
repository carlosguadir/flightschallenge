import { randomUUID } from 'node:crypto';

import type { BookingRequest } from '@flight/shared';

export function bookingBody(
  flightId: string,
  seatIdOrIds: string | string[],
  overrides: Partial<BookingRequest> = {},
): BookingRequest {
  const base: BookingRequest = {
    flightId,
    seatIds: Array.isArray(seatIdOrIds) ? seatIdOrIds : [seatIdOrIds],
    passenger: { name: 'Ada Lovelace', email: 'ada@example.com' },
    payment: { method: 'TEST_OK' },
  };

  return {
    ...base,
    ...overrides,
    seatIds: overrides.seatIds ?? base.seatIds,
    passenger: { ...base.passenger, ...overrides.passenger },
    payment: { ...base.payment, ...overrides.payment },
  };
}

export function idempotencyKey(): string {
  return randomUUID();
}
