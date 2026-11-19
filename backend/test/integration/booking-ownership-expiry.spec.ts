import type { INestApplication } from '@nestjs/common';
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

describe('booking ownership, expiry and cancellation guards', () => {
  let app: INestApplication;
  let pool: Pool;
  let agentA: ReturnType<typeof request.agent>;
  let agentB: ReturnType<typeof request.agent>;
  let flightId: string;

  beforeAll(async () => {
    await ensureTestDatabase();
    const created = await createTestApp();
    app = created.app;
    const database = app.get(DatabaseService);
    await database.migrate();
    await database.reset();

    pool = app.get<Pool>(PG_POOL);
    const server = app.getHttpServer() as Server;
    agentA = request.agent(server);
    agentB = request.agent(server);
    flightId = seedFlightId(PRIMARY_TEST_FLIGHT);
    await agentA.get('/api/health').expect(200);
    await agentB.get('/api/health').expect(200);
  });

  afterAll(async () => {
    await app.close();
  });

  it('10.6 rejects another session and lets the owner book', async () => {
    const seatId = seedSeatId(PRIMARY_TEST_FLIGHT, '1A');
    await agentA.post(`/api/flights/${flightId}/seats/${seatId}/hold`).expect(200);

    const otherBooking = await agentB
      .post('/api/bookings')
      .set('Idempotency-Key', idempotencyKey())
      .send(bookingBody(flightId, seatId))
      .expect(409);
    expect((otherBooking.body as { code?: string }).code).toBe('SEAT_UNAVAILABLE');

    await agentB.delete(`/api/flights/${flightId}/seats/${seatId}/hold`).expect(409);

    await agentA
      .post('/api/bookings')
      .set('Idempotency-Key', idempotencyKey())
      .send(bookingBody(flightId, seatId))
      .expect(201);
  });

  it('10.5 returns HOLD_EXPIRED when the hold expired before payment', async () => {
    const seatId = seedSeatId(PRIMARY_TEST_FLIGHT, '2A');
    await agentA.post(`/api/flights/${flightId}/seats/${seatId}/hold`).expect(200);

    await pool.query(
      `UPDATE seats SET hold_expires_at = now() - interval '1 second' WHERE id = $1`,
      [seatId],
    );

    const key = idempotencyKey();
    const response = await agentA
      .post('/api/bookings')
      .set('Idempotency-Key', key)
      .send(bookingBody(flightId, seatId))
      .expect(410);
    expect((response.body as { code?: string }).code).toBe('HOLD_EXPIRED');

    const rows = await pool.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM bookings WHERE idempotency_key = $1',
      [key],
    );
    expect(rows.rows[0].count).toBe(0);

    const seatRows = await pool.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM booking_seats WHERE seat_id = $1',
      [seatId],
    );
    expect(seatRows.rows[0].count).toBe(0);
  });

  it('10.11 rejects booking a hold on a cancelled flight', async () => {
    const seatId = seedSeatId(PRIMARY_TEST_FLIGHT, '3A');
    await agentA.post(`/api/flights/${flightId}/seats/${seatId}/hold`).expect(200);

    await pool.query(`UPDATE flights SET status = 'CANCELLED' WHERE id = $1`, [flightId]);

    const key = idempotencyKey();
    const response = await agentA
      .post('/api/bookings')
      .set('Idempotency-Key', key)
      .send(bookingBody(flightId, seatId))
      .expect(409);
    expect((response.body as { code?: string }).code).toBe('FLIGHT_NOT_BOOKABLE');

    const rows = await pool.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM bookings WHERE idempotency_key = $1',
      [key],
    );
    expect(rows.rows[0].count).toBe(0);
  });
});
