import type { FlightStatus, Seat, SeatStatus } from '@flight/shared';

import type { DbTransaction } from '../../../shared-kernel';

export interface ActiveHold {
  seatId: string;
  label: string;
  expiresAt: Date;
  flightVersion: number;
}

export interface AcquiredHold {
  seatId: string;
  label: string;
  expiresAt: Date;
}

export interface ReleasedSeat {
  seatId: string;
  label: string;
}

export interface ExpiredSeat {
  seatId: string;
  label: string;
}

export interface BookingSeat {
  seatId: string;
  label: string;
  status: SeatStatus;
  heldBySession: string | null;
  holdActive: boolean;
  priceCents: number;
  currency: string;
  flightStatus: FlightStatus;
}

export interface AcquireHoldInput {
  flightId: string;
  seatId: string;
  sessionId: string;
  ttlSeconds: number;
}

export interface HoldLookupInput {
  flightId: string;
  seatId: string;
  sessionId: string;
}

export interface SeatRepository {
  findActiveHold(tx: DbTransaction, input: HoldLookupInput): Promise<ActiveHold | null>;
  countActiveHolds(tx: DbTransaction, flightId: string, sessionId: string): Promise<number>;
  acquireHold(tx: DbTransaction, input: AcquireHoldInput): Promise<AcquiredHold | null>;
  releaseHold(tx: DbTransaction, input: HoldLookupInput): Promise<ReleasedSeat | null>;
  listByFlight(flightId: string, sessionId: string): Promise<Seat[]>;
  listFlightsWithExpiredHolds(tx: DbTransaction): Promise<string[]>;
  expireSeats(tx: DbTransaction, flightId: string): Promise<ExpiredSeat[]>;
  lockForBooking(tx: DbTransaction, flightId: string, seatIds: string[]): Promise<BookingSeat[]>;
}

export const SEAT_REPOSITORY = Symbol('SEAT_REPOSITORY');
