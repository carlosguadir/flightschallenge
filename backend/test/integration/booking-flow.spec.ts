import type { INestApplication } from '@nestjs/common';
import type { BookingResponse, SeatMap } from '@flight/shared';
import type { Pool } from 'pg';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DatabaseService } from '../../src/database/database.service';
import { PG_POOL } from '../../src/database/database.tokens';
import { PRIMARY_TEST_FLIGHT, seedFlightId, seedSeatId } from '../../src/database/seed';
import { bookingBody, idempotencyKey } from '../helpers/booking';
import { createTestApp } from '../helpers/create-test-app';
import { ensureTestDatabase } from '../helpers/test-database';

describe('booking contract, decline and validation', () => {
  let app: INestApplication;
  let pool: Pool;
  let agent: ReturnType<typeof request.agent>;
  let flightId: string;

  beforeAll(async () => {
    await ensureTestDatabase();
    const created = await createTestApp();
    app = created.app;
    const database = app.get(DatabaseService);
    await database.migrate();
    await database.reset();

    pool = app.get<Pool>(PG_POOL);
    agent = request.agent(app.getHttpServer() as Server);
    flightId = seedFlightId(PRIMARY_TEST_FLIGHT);
    await agent.get('/api/health').expect(200);
  });

  afterAll(async () => {
    await app.close();
  });

  it('books a held seat and returns the booking contract', async () => {
    const seatId = seedSeatId(PRIMARY_TEST_FLIGHT, '1A');
    await agent.post(`/api/flights/${flightId}/seats/${seatId}/hold`).expect(200);

    const response = await agent
      .post('/api/bookings')
      .set('Idempotency-Key', idempotencyKey())
      .send(bookingBody(flightId, seatId))
      .expect(201);

    const booking = response.body as BookingResponse;
    expect(booking).toMatchObject({
      flightId,
      currency: 'USD',
      passenger: { name: 'Ada Lovelace', email: 'ada@example.com' },
      seats: [expect.objectContaining({ seatId, seatLabel: '1A' })],
    });
    expect(booking.seats).toHaveLength(1);
    expect(booking.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(typeof booking.createdAt).toBe('string');

    const seatMap = await agent.get(`/api/flights/${flightId}/seats`).expect(200);
    const seat = (seatMap.body as SeatMap).seats.find((entry) => entry.id === seatId);
    expect(seat).toMatchObject({ status: 'BOOKED', isMine: false });
  });

  it('declines payment without consuming the hold', async () => {
    const seatId = seedSeatId(PRIMARY_TEST_FLIGHT, '2A');
    await agent.post(`/api/flights/${flightId}/seats/${seatId}/hold`).expect(200);
    const before = await pool.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM bookings',
    );

    const response = await agent
      .post('/api/bookings')
      .set('Idempotency-Key', idempotencyKey())
      .send(bookingBody(flightId, seatId, { payment: { method: 'TEST_DECLINE' } }))
      .expect(402);

    expect((response.body as { code?: string }).code).toBe('PAYMENT_DECLINED');

    const after = await pool.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM bookings',
    );
    expect(after.rows[0].count).toBe(before.rows[0].count);

    const seatMap = await agent.get(`/api/flights/${flightId}/seats`).expect(200);
    const seat = (seatMap.body as SeatMap).seats.find((entry) => entry.id === seatId);
    expect(seat).toMatchObject({ status: 'HELD', isMine: true });
  });

  it('rejects a missing or malformed Idempotency-Key', async () => {
    const seatId = seedSeatId(PRIMARY_TEST_FLIGHT, '3A');

    const missing = await agent
      .post('/api/bookings')
      .send(bookingBody(flightId, seatId))
      .expect(400);
    expect((missing.body as { code?: string }).code).toBe('VALIDATION_ERROR');

    const malformed = await agent
      .post('/api/bookings')
      .set('Idempotency-Key', 'not-a-uuid')
      .send(bookingBody(flightId, seatId))
      .expect(400);
    expect((malformed.body as { code?: string }).code).toBe('VALIDATION_ERROR');
  });

  it('rejects an invalid body', async () => {
    const seatId = seedSeatId(PRIMARY_TEST_FLIGHT, '3B');
    const response = await agent
      .post('/api/bookings')
      .set('Idempotency-Key', idempotencyKey())
      .send({ flightId, seatId })
      .expect(400);

    expect((response.body as { code?: string }).code).toBe('VALIDATION_ERROR');
  });

  it('rejects a seat that does not belong to the flight', async () => {
    const foreignSeatId = seedSeatId('AV1002', '1A');

    const response = await agent
      .post('/api/bookings')
      .set('Idempotency-Key', idempotencyKey())
      .send(bookingBody(flightId, foreignSeatId))
      .expect(409);

    expect((response.body as { code?: string }).code).toBe('SEAT_UNAVAILABLE');
  });
});
