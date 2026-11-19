import { randomUUID } from 'node:crypto';

import type { BookingRequest } from '@flight/shared';

export function bookingBody(
  flightId: string,
  seatId: string,
  overrides: Partial<BookingRequest> = {},
): BookingRequest {
  const base: BookingRequest = {
    flightId,
    seatId,
    passenger: { name: 'Ada Lovelace', email: 'ada@example.com' },
    payment: { method: 'TEST_OK' },
  };

  return {
    ...base,
    ...overrides,
    passenger: { ...base.passenger, ...overrides.passenger },
    payment: { ...base.payment, ...overrides.payment },
  };
}

export function idempotencyKey(): string {
  return randomUUID();
}
