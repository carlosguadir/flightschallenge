import { FLIGHT_STATUSES, SEAT_STATUSES } from '@flight/shared';
import type { SeatStatus } from '@flight/shared';
import { describe, expect, it } from 'vitest';

import {
  FLIGHT_STATUS_TRANSITIONS,
  canTransitionFlightStatus,
} from '../../src/catalog/domain/flight-status';
import {
  SEAT_TRANSITIONS,
  canTransitionSeat,
  isValidSeatShape,
  type SeatShape,
} from '../../src/reservations/domain/seat-state';

const validShapes: SeatShape[] = [
  {
    status: 'AVAILABLE',
    heldBySession: null,
    holdExpiresAt: null,
    bookingId: null,
  },
  {
    status: 'HELD',
    heldBySession: 'session-1',
    holdExpiresAt: new Date('2026-12-01T00:00:00Z'),
    bookingId: null,
  },
  {
    status: 'BOOKED',
    heldBySession: null,
    holdExpiresAt: null,
    bookingId: 'booking-1',
  },
];

describe('10.20 transition guards', () => {
  it('matches the seat state shape table', () => {
    for (const shape of validShapes) {
      expect(isValidSeatShape(shape)).toBe(true);
    }

    expect(isValidSeatShape({ ...validShapes[0], heldBySession: 'session-1' })).toBe(false);
    expect(isValidSeatShape({ ...validShapes[1], holdExpiresAt: null })).toBe(false);
    expect(isValidSeatShape({ ...validShapes[1], bookingId: 'booking-1' })).toBe(false);
    expect(isValidSeatShape({ ...validShapes[2], bookingId: null })).toBe(false);
    expect(isValidSeatShape({ ...validShapes[0], status: 'UNKNOWN' as SeatStatus })).toBe(false);
  });

  it('matches the seat transition table', () => {
    for (const from of SEAT_STATUSES) {
      for (const to of SEAT_STATUSES) {
        expect(canTransitionSeat(from, to)).toBe(SEAT_TRANSITIONS[from].includes(to));
      }
    }
  });

  it('matches the flight status transition table', () => {
    for (const from of FLIGHT_STATUSES) {
      for (const to of FLIGHT_STATUSES) {
        expect(canTransitionFlightStatus(from, to)).toBe(
          FLIGHT_STATUS_TRANSITIONS[from].includes(to),
        );
      }
    }

    expect(canTransitionFlightStatus('CANCELLED', 'SCHEDULED')).toBe(false);
    expect(canTransitionFlightStatus('CANCELLED', 'DELAYED')).toBe(false);
    expect(canTransitionFlightStatus('SCHEDULED', 'CANCELLED')).toBe(true);
    expect(canTransitionFlightStatus('DELAYED', 'SCHEDULED')).toBe(true);
  });
});
