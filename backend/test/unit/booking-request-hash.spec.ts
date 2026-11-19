import { describe, expect, it } from 'vitest';

import { hashBookingRequest } from '../../src/reservations/application/booking-request-hash';

const flightId = '11111111-1111-4111-8111-111111111111';
const seatId = '22222222-2222-4222-8222-222222222222';

describe('booking request hash', () => {
  it('is stable across property order and email casing', () => {
    const first = hashBookingRequest({
      flightId,
      seatId,
      passenger: { name: 'Ada Lovelace', email: 'ada@example.com' },
      payment: { method: 'TEST_OK' },
    });
    const second = hashBookingRequest({
      payment: { method: 'TEST_OK' },
      passenger: { email: 'ADA@EXAMPLE.COM', name: 'Ada Lovelace' },
      seatId,
      flightId,
    });

    expect(second).toBe(first);
  });

  it('changes when passenger, seat or payment method changes', () => {
    const base = hashBookingRequest({
      flightId,
      seatId,
      passenger: { name: 'Ada Lovelace', email: 'ada@example.com' },
      payment: { method: 'TEST_OK' },
    });

    expect(
      hashBookingRequest({
        flightId,
        seatId,
        passenger: { name: 'Grace Hopper', email: 'ada@example.com' },
        payment: { method: 'TEST_OK' },
      }),
    ).not.toBe(base);

    expect(
      hashBookingRequest({
        flightId,
        seatId,
        passenger: { name: 'Ada Lovelace', email: 'ada@example.com' },
        payment: { method: 'TEST_DECLINE' },
      }),
    ).not.toBe(base);
  });
});
