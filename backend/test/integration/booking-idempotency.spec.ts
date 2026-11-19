import type { INestApplication } from '@nestjs/common';
import type { BookingResponse } from '@flight/shared';
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

describe('10.7 / 10.14 booking idempotency', () => {
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

  it('10.7 replays the same key and rejects a different payload', async () => {
    const seatId = seedSeatId(PRIMARY_TEST_FLIGHT, '1A');
    await agent.post(`/api/flights/${flightId}/seats/${seatId}/hold`).expect(200);

    const key = idempotencyKey();
    const body = bookingBody(flightId, seatId);

    const first = await agent
      .post('/api/bookings')
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201);
    const replay = await agent
      .post('/api/bookings')
      .set('Idempotency-Key', key)
      .send(body)
      .expect(200);

    expect((replay.body as BookingResponse).code).toBe((first.body as BookingResponse).code);

    const conflict = await agent
      .post('/api/bookings')
      .set('Idempotency-Key', key)
      .send(
        bookingBody(flightId, seatId, {
          passenger: { name: 'Grace Hopper', email: 'grace@example.com' },
        }),
      )
      .expect(409);
    expect((conflict.body as { code?: string }).code).toBe('IDEMPOTENCY_CONFLICT');

    const rows = await pool.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM bookings WHERE idempotency_key = $1',
      [key],
    );
    expect(rows.rows[0].count).toBe(1);
  });

  it('10.14 resolves concurrent same-key requests to one 201 and one 200', async () => {
    const seatId = seedSeatId(PRIMARY_TEST_FLIGHT, '2A');
    await agent.post(`/api/flights/${flightId}/seats/${seatId}/hold`).expect(200);

    const key = idempotencyKey();
    const body = bookingBody(flightId, seatId);

    const responses = await Promise.all([
      agent.post('/api/bookings').set('Idempotency-Key', key).send(body),
      agent.post('/api/bookings').set('Idempotency-Key', key).send(body),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 201]);
    const codes = responses.map((response) => (response.body as BookingResponse).code);
    expect(codes[0]).toBe(codes[1]);

    const rows = await pool.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM bookings WHERE idempotency_key = $1',
      [key],
    );
    expect(rows.rows[0].count).toBe(1);

    const replay = await agent
      .post('/api/bookings')
      .set('Idempotency-Key', key)
      .send(body)
      .expect(200);
    expect((replay.body as BookingResponse).code).toBe(codes[0]);
  });
});
