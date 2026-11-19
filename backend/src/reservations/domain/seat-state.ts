import type { SeatStatus } from '@flight/shared';

export interface SeatShape {
  status: SeatStatus;
  heldBySession: string | null;
  holdExpiresAt: Date | null;
  bookingId: string | null;
}

/**
 * Mirrors the seats_state_shape CHECK constraint in 001_init.sql.
 * Keep both in sync; test 10.20 compares this function against the real DB.
 */
export function isValidSeatShape(shape: SeatShape): boolean {
  switch (shape.status) {
    case 'AVAILABLE':
      return (
        shape.heldBySession === null && shape.holdExpiresAt === null && shape.bookingId === null
      );
    case 'HELD':
      return (
        shape.heldBySession !== null && shape.holdExpiresAt !== null && shape.bookingId === null
      );
    case 'BOOKED':
      return (
        shape.heldBySession === null && shape.holdExpiresAt === null && shape.bookingId !== null
      );
    default:
      return false;
  }
}

export const SEAT_TRANSITIONS: Record<SeatStatus, readonly SeatStatus[]> = {
  AVAILABLE: ['HELD'],
  HELD: ['AVAILABLE', 'BOOKED'],
  BOOKED: [],
};

export function canTransitionSeat(from: SeatStatus, to: SeatStatus): boolean {
  return SEAT_TRANSITIONS[from].includes(to);
}
