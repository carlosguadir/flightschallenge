import type { INestApplication } from '@nestjs/common';
import type { BookingLookupResponse, BookingResponse, ServerEvent } from '@flight/shared';
import type { Pool } from 'pg';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DatabaseService } from '../../src/database/database.service';
import { PG_POOL } from '../../src/database/database.tokens';
import { seedFlightId, seedSeatId } from '../../src/database/seed';
import { InProcessEventBus } from '../../src/shared-kernel';
import { bookingBody, idempotencyKey } from '../helpers/booking';
import { createTestApp } from '../helpers/create-test-app';
import { ensureTestDatabase } from '../helpers/test-database';

describe('multi-seat booking reservation', () => {
  let app: INestApplication;
  let pool: Pool;
  let agent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    await ensureTestDatabase();
    const created = await createTestApp();
    app = created.app;
    const database = app.get(DatabaseService);
    await database.migrate();
    await database.reset();

    pool = app.get<Pool>(PG_POOL);
    agent = request.agent(app.getHttpServer() as Server);
    await agent.get('/api/health').expect(200);
  });

  afterAll(async () => {
    await app.close();
  });

  it('books four held seats under one code and one transaction', async () => {
    const flightNumber = 'AV1001';
    const flightId = seedFlightId(flightNumber);
    const labels = ['1A', '1B', '2A', '2B'];
    const seatIds = labels.map((label) => seedSeatId(flightNumber, label));

    for (const seatId of seatIds) {
      await agent.post(`/api/flights/${flightId}/seats/${seatId}/hold`).expect(200);
    }

    const events: ServerEvent[] = [];
    const unsubscribe = app.get(InProcessEventBus).subscribe((event) => events.push(event));

    const response = await agent
      .post('/api/bookings')
      .set('Idempotency-Key', idempotencyKey())
      .send(bookingBody(flightId, seatIds))
      .expect(201);
    unsubscribe();

    const booking = response.body as BookingResponse;
    expect(booking.seats.map((seat) => seat.seatLabel)).toEqual(labels);
    expect(booking.seats.map((seat) => seat.seatId)).toEqual(seatIds);
    expect(booking.amountCents).toBe(
      booking.seats.reduce((total, seat) => total + seat.priceCents, 0),
    );

    const bookedEvents = events.filter(
      (event) => event.name === 'seat.booked' && event.payload.flightId === flightId,
    );
    expect(bookedEvents).toHaveLength(4);
    const versions = bookedEvents
      .map((event) => (event.name === 'seat.booked' ? event.payload.version : 0))
      .sort((left, right) => left - right);
    expect(versions).toEqual([5, 6, 7, 8]);

    const headerRows = await pool.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM bookings WHERE flight_id = $1',
      [flightId],
    );
    expect(headerRows.rows[0].count).toBe(1);

    const lineRows = await pool.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM booking_seats bs JOIN bookings b ON b.id = bs.booking_id WHERE b.flight_id = $1',
      [flightId],
    );
    expect(lineRows.rows[0].count).toBe(4);

    const seats = await pool.query<{ status: string }>(
      'SELECT status FROM seats WHERE id = ANY($1::uuid[]) ORDER BY label',
      [seatIds],
    );
    expect(seats.rows.map((seat) => seat.status)).toEqual(['BOOKED', 'BOOKED', 'BOOKED', 'BOOKED']);
  });

  it('returns all seats on lookup and replays the same group', async () => {
    const flightNumber = 'AV1004';
    const flightId = seedFlightId(flightNumber);
    const labels = ['1A', '1B'];
    const seatIds = labels.map((label) => seedSeatId(flightNumber, label));

    for (const seatId of seatIds) {
      await agent.post(`/api/flights/${flightId}/seats/${seatId}/hold`).expect(200);
    }

    const key = idempotencyKey();
    const body = bookingBody(flightId, seatIds);
    const first = await agent
      .post('/api/bookings')
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201);
    const booking = first.body as BookingResponse;

    const replay = await agent
      .post('/api/bookings')
      .set('Idempotency-Key', key)
      .send(body)
      .expect(200);
    expect((replay.body as BookingResponse).code).toBe(booking.code);
    expect((replay.body as BookingResponse).seats).toEqual(booking.seats);

    const lookup = await agent
      .post('/api/bookings/lookup')
      .send({ code: booking.code, email: 'ADA@EXAMPLE.COM' })
      .expect(200);
    const ticket = lookup.body as BookingLookupResponse;
    expect(ticket.seats.map((seat) => seat.seatLabel)).toEqual(labels);
    expect(ticket.amountCents).toBe(booking.amountCents);
  });

  it('fails the whole reservation if one hold expired and does not create a booking', async () => {
    const flightNumber = 'AV1003';
    const flightId = seedFlightId(flightNumber);
    const labels = ['1A', '1B'];
    const seatIds = labels.map((label) => seedSeatId(flightNumber, label));

    for (const seatId of seatIds) {
      await agent.post(`/api/flights/${flightId}/seats/${seatId}/hold`).expect(200);
    }

    await pool.query(
      `UPDATE seats SET hold_expires_at = now() - interval '1 second' WHERE id = $1`,
      [seatIds[0]],
    );

    const key = idempotencyKey();
    const response = await agent
      .post('/api/bookings')
      .set('Idempotency-Key', key)
      .send(bookingBody(flightId, seatIds))
      .expect(410);
    expect((response.body as { code?: string }).code).toBe('HOLD_EXPIRED');

    const bookings = await pool.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM bookings WHERE idempotency_key = $1',
      [key],
    );
    expect(bookings.rows[0].count).toBe(0);

    const lines = await pool.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM booking_seats bs JOIN bookings b ON b.id = bs.booking_id WHERE b.flight_id = $1',
      [flightId],
    );
    expect(lines.rows[0].count).toBe(0);

    const seats = await pool.query<{ status: string }>(
      'SELECT status FROM seats WHERE id = ANY($1::uuid[]) ORDER BY label',
      [seatIds],
    );
    expect(seats.rows.map((seat) => seat.status)).toEqual(['HELD', 'HELD']);
  });

  it('rejects a different seat set under an existing idempotency key', async () => {
    const flightNumber = 'AV1005';
    const flightId = seedFlightId(flightNumber);
    const seatIds = ['1A', '1B'].map((label) => seedSeatId(flightNumber, label));

    for (const seatId of seatIds) {
      await agent.post(`/api/flights/${flightId}/seats/${seatId}/hold`).expect(200);
    }

    const key = idempotencyKey();
    await agent
      .post('/api/bookings')
      .set('Idempotency-Key', key)
      .send(bookingBody(flightId, seatIds))
      .expect(201);

    const conflict = await agent
      .post('/api/bookings')
      .set('Idempotency-Key', key)
      .send(bookingBody(flightId, [seatIds[0]]))
      .expect(409);
    expect((conflict.body as { code?: string }).code).toBe('IDEMPOTENCY_CONFLICT');
  });
});
