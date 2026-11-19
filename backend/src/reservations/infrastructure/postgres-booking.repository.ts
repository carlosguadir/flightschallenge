import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';

import { PG_POOL } from '../../database/database.tokens';
import type { DbTransaction } from '../../shared-kernel';
import type {
  BookingLookupRecord,
  BookingRecord,
  BookingRepository,
  BookingSeatRecord,
  NewBooking,
} from '../application/ports/booking-repository.port';
import { BookingWriteConflict } from '../domain/booking-write-conflict';

interface BookingRow {
  id: string;
  code: string;
  flight_id: string;
  session_id: string;
  passenger_name: string;
  passenger_email: string;
  amount_cents: number;
  currency: string;
  idempotency_key: string;
  request_hash: string;
  created_at: Date;
}

interface BookingSeatRow {
  seat_id: string;
  seat_label: string;
  price_cents: number;
}

interface LookupRow {
  id: string;
  code: string;
  flight_id: string;
  flight_number: string;
  origin: string;
  destination: string;
  departure_at: Date;
  passenger_name: string;
  amount_cents: number;
  currency: string;
  created_at: Date;
}

const BOOKING_SELECT = `
  SELECT b.id,
         b.code,
         b.flight_id,
         b.session_id,
         b.passenger_name,
         b.passenger_email,
         b.amount_cents,
         b.currency,
         b.idempotency_key,
         b.request_hash,
         b.created_at
  FROM bookings b
`;

const BOOKING_SEAT_SELECT = `
  SELECT seat_id, seat_label, price_cents
  FROM booking_seats
  WHERE booking_id = $1
  ORDER BY seat_label
`;

function asUniqueViolation(error: unknown): { constraint?: string } | null {
  if ((error as { code?: string } | null)?.code !== '23505') return null;
  return { constraint: (error as { constraint?: string }).constraint };
}

@Injectable()
export class PostgresBookingRepository implements BookingRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findByKey(idempotencyKey: string): Promise<BookingRecord | null> {
    const result = await this.pool.query<BookingRow>(
      `${BOOKING_SELECT} WHERE b.idempotency_key = $1`,
      [idempotencyKey],
    );
    const row = result.rows[0];
    if (!row) return null;

    return this.mapBooking(row, await this.loadSeats(null, row.id));
  }

  async findByKeyInTransaction(
    tx: DbTransaction,
    idempotencyKey: string,
  ): Promise<BookingRecord | null> {
    const result = await tx.query<BookingRow>(`${BOOKING_SELECT} WHERE b.idempotency_key = $1`, [
      idempotencyKey,
    ]);
    const row = result.rows[0];
    if (!row) return null;

    return this.mapBooking(row, await this.loadSeats(tx, row.id));
  }

  async insert(tx: DbTransaction, booking: NewBooking): Promise<BookingRecord> {
    try {
      const result = await tx.query<{ created_at: Date }>(
        `INSERT INTO bookings (
           id, code, flight_id, session_id,
           passenger_name, passenger_email, amount_cents, currency,
           idempotency_key, request_hash
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING created_at`,
        [
          booking.id,
          booking.code,
          booking.flightId,
          booking.sessionId,
          booking.passengerName,
          booking.passengerEmail,
          booking.amountCents,
          booking.currency,
          booking.idempotencyKey,
          booking.requestHash,
        ],
      );

      const row = result.rows[0];
      if (!row) {
        throw new Error('Booking insert returned no row');
      }

      const values: unknown[] = [];
      const placeholders = booking.seats.map((seat, index) => {
        const offset = index * 4;
        values.push(booking.id, seat.seatId, seat.seatLabel, seat.priceCents);
        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`;
      });

      await tx.query(
        `INSERT INTO booking_seats (booking_id, seat_id, seat_label, price_cents)
         VALUES ${placeholders.join(', ')}`,
        values,
      );

      return {
        id: booking.id,
        code: booking.code,
        flightId: booking.flightId,
        seats: booking.seats,
        sessionId: booking.sessionId,
        passengerName: booking.passengerName,
        passengerEmail: booking.passengerEmail,
        amountCents: booking.amountCents,
        currency: booking.currency,
        idempotencyKey: booking.idempotencyKey,
        requestHash: booking.requestHash,
        createdAt: row.created_at,
      };
    } catch (error) {
      const unique = asUniqueViolation(error);
      if (unique) {
        throw new BookingWriteConflict(unique.constraint, error);
      }
      throw error;
    }
  }

  async findByCodeAndEmail(code: string, email: string): Promise<BookingLookupRecord | null> {
    const result = await this.pool.query<LookupRow>(
      `SELECT b.id,
              b.code,
              b.flight_id,
              f.flight_number,
              f.origin,
              f.destination,
              f.departure_at,
              b.passenger_name,
              b.amount_cents,
              b.currency,
              b.created_at
       FROM bookings b
       JOIN flights f ON f.id = b.flight_id
       WHERE b.code = $1 AND b.passenger_email = $2`,
      [code, email],
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
      code: row.code,
      flightId: row.flight_id,
      flightNumber: row.flight_number,
      origin: row.origin.trim(),
      destination: row.destination.trim(),
      departureAt: row.departure_at,
      seats: await this.loadSeats(null, row.id),
      passengerName: row.passenger_name,
      amountCents: row.amount_cents,
      currency: row.currency.trim(),
      createdAt: row.created_at,
    };
  }

  private async loadSeats(
    tx: DbTransaction | null,
    bookingId: string,
  ): Promise<BookingSeatRecord[]> {
    const result = tx
      ? await tx.query<BookingSeatRow>(BOOKING_SEAT_SELECT, [bookingId])
      : await this.pool.query<BookingSeatRow>(BOOKING_SEAT_SELECT, [bookingId]);

    return result.rows.map((row) => ({
      seatId: row.seat_id,
      seatLabel: row.seat_label,
      priceCents: row.price_cents,
    }));
  }

  private mapBooking(row: BookingRow, seats: BookingSeatRecord[]): BookingRecord {
    return {
      id: row.id,
      code: row.code,
      flightId: row.flight_id,
      seats,
      sessionId: row.session_id,
      passengerName: row.passenger_name,
      passengerEmail: row.passenger_email,
      amountCents: row.amount_cents,
      currency: row.currency.trim(),
      idempotencyKey: row.idempotency_key,
      requestHash: row.request_hash,
      createdAt: row.created_at,
    };
  }
}
