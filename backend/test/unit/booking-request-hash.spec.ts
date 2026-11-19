import { describe, expect, it } from 'vitest';

import { hashBookingRequest } from '../../src/reservations/application/booking-request-hash';

const flightId = '11111111-1111-4111-8111-111111111111';
const seatA = '22222222-2222-4222-8222-222222222222';
const seatB = '33333333-3333-4333-8333-333333333333';

describe('booking request hash', () => {
  it('is stable across property order, seat order and email casing', () => {
    const first = hashBookingRequest({
      flightId,
      seatIds: [seatA, seatB],
      passenger: { name: 'Ada Lovelace', email: 'ada@example.com' },
      payment: { method: 'TEST_OK' },
    });
    const second = hashBookingRequest({
      payment: { method: 'TEST_OK' },
      passenger: { email: 'ADA@EXAMPLE.COM', name: 'Ada Lovelace' },
      seatIds: [seatB, seatA],
      flightId,
    });

    expect(second).toBe(first);
  });

  it('changes when passenger, seat set or payment method changes', () => {
    const base = hashBookingRequest({
      flightId,
      seatIds: [seatA],
      passenger: { name: 'Ada Lovelace', email: 'ada@example.com' },
      payment: { method: 'TEST_OK' },
    });

    expect(
      hashBookingRequest({
        flightId,
        seatIds: [seatA],
        passenger: { name: 'Grace Hopper', email: 'ada@example.com' },
        payment: { method: 'TEST_OK' },
      }),
    ).not.toBe(base);

    expect(
      hashBookingRequest({
        flightId,
        seatIds: [seatA, seatB],
        passenger: { name: 'Ada Lovelace', email: 'ada@example.com' },
        payment: { method: 'TEST_OK' },
      }),
    ).not.toBe(base);

    expect(
      hashBookingRequest({
        flightId,
        seatIds: [seatA],
        passenger: { name: 'Ada Lovelace', email: 'ada@example.com' },
        payment: { method: 'TEST_DECLINE' },
      }),
    ).not.toBe(base);
  });
});
