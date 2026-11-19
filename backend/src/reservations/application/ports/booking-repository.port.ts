import type { DbTransaction } from '../../../shared-kernel';

export interface BookingSeatRecord {
  seatId: string;
  seatLabel: string;
  priceCents: number;
}

export interface BookingRecord {
  id: string;
  code: string;
  flightId: string;
  seats: BookingSeatRecord[];
  sessionId: string;
  passengerName: string;
  passengerEmail: string;
  amountCents: number;
  currency: string;
  idempotencyKey: string;
  requestHash: string;
  createdAt: Date;
}

export interface NewBooking {
  id: string;
  code: string;
  flightId: string;
  seats: BookingSeatRecord[];
  sessionId: string;
  passengerName: string;
  passengerEmail: string;
  amountCents: number;
  currency: string;
  idempotencyKey: string;
  requestHash: string;
}

export interface BookingLookupRecord {
  code: string;
  flightId: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departureAt: Date;
  seats: BookingSeatRecord[];
  passengerName: string;
  amountCents: number;
  currency: string;
  createdAt: Date;
}

export interface BookingRepository {
  findByKey(idempotencyKey: string): Promise<BookingRecord | null>;
  findByKeyInTransaction(tx: DbTransaction, idempotencyKey: string): Promise<BookingRecord | null>;
  insert(tx: DbTransaction, booking: NewBooking): Promise<BookingRecord>;
  findByCodeAndEmail(code: string, email: string): Promise<BookingLookupRecord | null>;
}

export const BOOKING_REPOSITORY = Symbol('BOOKING_REPOSITORY');
