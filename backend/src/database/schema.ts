import type { FlightStatus, SeatClass, SeatStatus } from '@flight/shared';
import {
  bigint,
  boolean,
  char,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const flights = pgTable('flights', {
  id: uuid('id').primaryKey(),
  flightNumber: text('flight_number').notNull().unique(),
  origin: char('origin').notNull(),
  destination: char('destination').notNull(),
  departureAt: timestamp('departure_at', { withTimezone: true }).notNull(),
  arrivalAt: timestamp('arrival_at', { withTimezone: true }).notNull(),
  priceCents: integer('price_cents').notNull(),
  currency: char('currency').notNull(),
  status: text('status').$type<FlightStatus>().notNull().default('SCHEDULED'),
  soldOut: boolean('sold_out').notNull().default(false),
  delayMinutes: integer('delay_minutes').notNull().default(0),
  version: bigint('version', { mode: 'number' }).notNull().default(0),
});

export const seats = pgTable('seats', {
  id: uuid('id').primaryKey(),
  flightId: uuid('flight_id')
    .notNull()
    .references(() => flights.id, { onDelete: 'cascade' }),
  seatRow: integer('seat_row').notNull(),
  seatCol: text('seat_col').notNull(),
  label: text('label').notNull(),
  travelClass: text('class').$type<SeatClass>().notNull(),
  priceCents: integer('price_cents').notNull(),
  status: text('status').$type<SeatStatus>().notNull().default('AVAILABLE'),
  heldBySession: text('held_by_session'),
  holdExpiresAt: timestamp('hold_expires_at', { withTimezone: true }),
  bookingId: uuid('booking_id'),
  version: bigint('version', { mode: 'number' }).notNull().default(0),
});

export const bookings = pgTable('bookings', {
  id: uuid('id').primaryKey(),
  code: text('code').notNull().unique(),
  flightId: uuid('flight_id')
    .notNull()
    .references(() => flights.id),
  sessionId: text('session_id').notNull(),
  passengerName: text('passenger_name').notNull(),
  passengerEmail: text('passenger_email').notNull(),
  amountCents: integer('amount_cents').notNull(),
  currency: char('currency').notNull(),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  requestHash: text('request_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bookingSeats = pgTable('booking_seats', {
  bookingId: uuid('booking_id')
    .notNull()
    .references(() => bookings.id, { onDelete: 'cascade' }),
  seatId: uuid('seat_id')
    .notNull()
    .unique()
    .references(() => seats.id),
  seatLabel: text('seat_label').notNull(),
  priceCents: integer('price_cents').notNull(),
});
